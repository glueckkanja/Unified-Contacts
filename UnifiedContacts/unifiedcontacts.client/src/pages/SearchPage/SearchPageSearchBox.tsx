import {
  getSearchControllerSearchAzureAD,
  getSearchControllerSearchOrgContacts,
  getSearchControllerSearchUserContacts,
  getSearchControllerSearchSharePoint,
  postContactsControllerGetBatchContactImages,
  postContactsControllerGetBatchPresence,
  getSearchControllerSearchDatabase,
} from "../../services/ApiService";
import localizedStrings from "../../loacalization/localization";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { SearchResult } from "../../components/SearchResult";
import headerSmallTilted from "../../assets/images/headerSmallTilted.png";
import headerSmall from "../../assets/images/headerSmall.png";
import {
  TCancelablePromise,
  TCancelablePromiseError,
  TGetBackendConfigResponse,
  TokenInfo,
  TSearchSourceLoading,
  TUnfiedSearchState,
  TUnifiedContactsImageResponse,
  TUnifiedContactsPresenceResponse,
  TUnifiedContactsSearchResponse,
  TUnifiedContactsSearchResponseSearchResult,
} from "../../types/Types";
import {
  ALERT_TYPE,
  SORT_CATEGORY,
  SORT_TYPE,
  SOURCE,
} from "../../types/Enums";
import { getCancelablePromise } from "../../services/PromiseService";
import { Mutex } from "async-mutex";
import { compareSearchResults } from "../../services/SortService";
import { cachingService } from "../../services/CachingService";
import { Button, Theme } from "@fluentui/react-components";
import ControlBar from "../../components/ControlBar";
import { TeamsPageAlertServiceContext } from "../../providers/TeamsPageAlertServiceContextProvider";
import { useTeamsContext } from "../../providers/TeamsContextProvider";

const CONTACT_PHOTO_REQUEST_BATCH_SIZE = 20;
const SEARCH_RESULT_BUFFER_MUTEX = new Mutex();
const PRESENCE_UPDATE_POLLING_INTERVAL_IN_MILLISECONDS = 10000;
export type SearchPageSearchBoxProps = {
  tenantId: string;
  theme: Theme | undefined;
  backendConfig?: TGetBackendConfigResponse;
  checkAdminGrant: () => Promise<boolean>;
  currentUser: TokenInfo;
  updateSearchResultFavoriteState: (
    searchResultToUpdate: TUnifiedContactsSearchResponseSearchResult,
    newIsFavorite: boolean
  ) => Promise<void>;
};

let global_searchResultPendingPromises: TCancelablePromise<
  TUnifiedContactsSearchResponse | undefined
>[] = [];
let global_searchPendingPromises: TCancelablePromise<any>[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
let global_postLoadingTimer: NodeJS.Timeout | undefined;
let global_searchResultsBuffer: TUnifiedContactsSearchResponseSearchResult[] =
  [];
let global_displayedResultCount = 0;

const global_sourcesLoading: TSearchSourceLoading = {
  isUCSearchLoading: false,
  isAadLoading: false,
  isUserContactsLoading: false,
  isOrgContactsLoading: false,
  isSharePointLoading: false,
  isDatabaseLoading: false,
};
let global_loadingAlertId: string | undefined = undefined;

const MAX_WAIT_FOR_OTHER_ENDPOINTS = 1000;

export function SearchPageSearchBox(props: SearchPageSearchBoxProps) {
  const teamsAlertService = useContext(TeamsPageAlertServiceContext);
  const teamsContext = useTeamsContext();
  const pollingIntervalId = useRef<NodeJS.Timeout>();
  const [searchQuery, setSearchQuery] = useState(
    () => cachingService.getCachedSearchQuery(props.tenantId) ?? ""
  );

  const [allSearchState, setAllSearchState] = useState<TUnfiedSearchState>(
    () =>
      props.tenantId
        ? {
            loading: false,
            allSearchResults: cachingService.getCachedSearchResults(
              props.tenantId
            ),
            sortSetting: cachingService.getCachedSortSetting(props.tenantId),
          }
        : {
            loading: false,
            allSearchResults: [],
            sortSetting: {
              sortType: SORT_TYPE.UNSORTED,
              sortCategory: undefined,
            },
          }
  );
  const [allPresenceResults, setAllPresenceResults] = useState<
    TUnifiedContactsPresenceResponse[]
  >([]);
  const [allPhotosResults, setAllPhotosResults] = useState<
    TUnifiedContactsImageResponse[]
  >(() => cachingService.getContactImageCache(props.tenantId) ?? []);

  const onSearchResultChange = (searchState: TUnfiedSearchState) => {
    setAllSearchState({
      loading: searchState.loading,
      allSearchResults: searchState.allSearchResults,
      sortSetting: searchState.sortSetting,
    });
    cachingService.setCachedSearchResults(
      props.tenantId,
      searchState.allSearchResults,
      searchState.sortSetting
    );
  };

  const updatePresence = useCallback(() => {
    if (!allSearchState.allSearchResults) {
      return;
    }
    const aadContactIds: string[] = [];
    allSearchState.allSearchResults.forEach((aadContact) => {
      if (aadContact.id && aadContact.source === SOURCE.AZURE_AD) {
        aadContactIds.push(aadContact.id);
      }
    });
    const userPresence = postContactsControllerGetBatchPresence(aadContactIds);
    userPresence.then((value) => {
      setAllPresenceResults(value);
    });
  }, [allSearchState.allSearchResults]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function cancelAllPromises(promises?: TCancelablePromise<any>[]) {
    if (promises) {
      promises.forEach((cancelablePromise) => {
        cancelablePromise.cancel();
      });
    }
  }

  const isAnySourceLoading = (): boolean => {
    return (
      global_sourcesLoading.isAadLoading ||
      global_sourcesLoading.isOrgContactsLoading ||
      global_sourcesLoading.isUserContactsLoading ||
      global_sourcesLoading.isSharePointLoading ||
      global_sourcesLoading.isDatabaseLoading
    );
  };

  const getLoadingSources = (): string[] => {
    const loadingSources: string[] = [];
    if (global_sourcesLoading.isAadLoading) {
      loadingSources.push("AAD");
    }
    if (global_sourcesLoading.isOrgContactsLoading) {
      loadingSources.push("OrgContact");
    }
    if (global_sourcesLoading.isUserContactsLoading) {
      loadingSources.push("UserContact");
    }
    if (global_sourcesLoading.isSharePointLoading) {
      loadingSources.push("SharePoint");
    }
    if (global_sourcesLoading.isDatabaseLoading) {
      loadingSources.push("Database");
    }
    return loadingSources;
  };

  const handleResult = (
    result: TUnifiedContactsSearchResponse | undefined,
    setLoadingFalse: () => void
  ) => {
    if (!result) {
      result = {
        searchResult: [],
      };
    }

    SEARCH_RESULT_BUFFER_MUTEX.runExclusive(() => {
      let newSearchState: TUnfiedSearchState | undefined = undefined;
      if (
        !global_postLoadingTimer &&
        result &&
        result.searchResult.length > 0
      ) {
        global_postLoadingTimer = setTimeout(() => {
          SEARCH_RESULT_BUFFER_MUTEX.runExclusive(async () => {
            global_displayedResultCount = global_searchResultsBuffer.length;
            global_searchResultsBuffer.sort(compareSearchResults);
            newSearchState = {
              loading: false,
              allSearchResults: [...global_searchResultsBuffer],
              sortSetting: {
                sortType: SORT_TYPE.ASCENDING,
                sortCategory: SORT_CATEGORY.DISPLAYNAME,
              },
            };
            setAllSearchState(newSearchState);
            global_sourcesLoading.isUCSearchLoading = false;
            if (isAnySourceLoading()) {
              global_loadingAlertId = teamsAlertService?.pushAlert(
                `${localizedStrings.formatString(
                  localizedStrings.sourcesStillLoadingAlert,
                  {
                    sources: getLoadingSources().join(", "),
                  }
                )}`,
                ALERT_TYPE.INFO
              );
            }
          });
        }, MAX_WAIT_FOR_OTHER_ENDPOINTS);
      }
      setLoadingFalse();
      if (result && result.searchResult.length > 0) {
        const sortedSearchResult =
          result && result.searchResult.sort(compareSearchResults);
        global_searchResultsBuffer =
          global_searchResultsBuffer.concat(sortedSearchResult);
        if (!global_sourcesLoading.isUCSearchLoading || !isAnySourceLoading()) {
          newSearchState = {
            loading: false,
            allSearchResults: [...global_searchResultsBuffer],
            sortSetting: {
              sortType: SORT_TYPE.UNSORTED,
              sortCategory: undefined,
            },
          };
          setAllSearchState(newSearchState);
          global_sourcesLoading.isUCSearchLoading = false;
        }
      }

      if (!isAnySourceLoading()) {
        if (global_postLoadingTimer) {
          clearTimeout(global_postLoadingTimer);
          global_postLoadingTimer = undefined;
        }
        if (global_searchResultsBuffer.length === 0) {
          newSearchState = {
            loading: false,
            allSearchResults: [],
            sortSetting: {
              sortType: SORT_TYPE.UNSORTED,
              sortCategory: undefined,
            },
          };
        } else {
          newSearchState = {
            loading: false,
            allSearchResults: [...global_searchResultsBuffer],
            sortSetting: {
              sortType: SORT_TYPE.UNSORTED,
              sortCategory: undefined,
            },
          };
          global_sourcesLoading.isUCSearchLoading = false;
        }
        setAllSearchState(newSearchState);
      }
      // We do not update/overwrite the cash if there is no change since the last SearchState update
      if (newSearchState !== undefined) {
        cachingService.setCachedSearchResults(
          props.tenantId,
          newSearchState.allSearchResults
            ? [...newSearchState.allSearchResults].sort(compareSearchResults)
            : [],
          {
            sortType: SORT_TYPE.ASCENDING,
            sortCategory: SORT_CATEGORY.DISPLAYNAME,
          }
        );
      }
    }).then(() => {
      tryUpdateSearchPendingAlertMessage();
    });
  };

  const tryUpdateSearchPendingAlertMessage = () => {
    if (global_loadingAlertId) {
      const loadingSources: string[] = getLoadingSources();
      if (loadingSources.length > 0) {
        teamsAlertService?.updateAlert(
          global_loadingAlertId,
          `${localizedStrings.formatString(
            localizedStrings.sourcesStillLoadingAlert,
            {
              sources: loadingSources.join(", "),
            }
          )}`,
          ALERT_TYPE.INFO
        );
      } else {
        if (global_displayedResultCount !== global_searchResultsBuffer.length) {
          teamsAlertService?.updateAlert(
            global_loadingAlertId,
            `${localizedStrings.formatString(
              localizedStrings.sourcesSuccessFinishedLoadingAlert,
              {
                additionalResultCount:
                  global_searchResultsBuffer.length -
                  global_displayedResultCount,
              }
            )}`,
            ALERT_TYPE.SUCCESS,
            <Button
              key="resort"
              appearance="primary"
              onClick={() => {
                setAllSearchState({
                  loading: false,
                  allSearchResults:
                    global_searchResultsBuffer.sort(compareSearchResults),
                  sortSetting: {
                    sortType: SORT_TYPE.ASCENDING,
                    sortCategory: SORT_CATEGORY.DISPLAYNAME,
                  },
                });
                if (global_loadingAlertId) {
                  teamsAlertService?.removeAlert(global_loadingAlertId);
                  global_loadingAlertId = undefined;
                }
              }}
            >
              {localizedStrings.resortButton}
            </Button>
          );
        } else {
          if (global_loadingAlertId) {
            teamsAlertService?.removeAlert(global_loadingAlertId);
            global_loadingAlertId = undefined;
          }
        }
      }
    }
  };

  const pushSourceSearchFailedWarningAlert = (source: string) => {
    teamsAlertService?.pushAlert(
      `${localizedStrings.formatString(
        localizedStrings.sourceLoadingFailedAlert,
        {
          source: source,
        }
      )}`,
      ALERT_TYPE.WARNING,
      undefined,
      10000,
      true
    );
  };

  const searchContacts = async (query: string) => {
    setAllSearchState({
      loading: true,
      allSearchResults: [],
      sortSetting: {
        sortType: SORT_TYPE.UNSORTED,
        sortCategory: undefined,
      },
    });
    if (!(await props.checkAdminGrant())) {
      return;
    }
    if (global_loadingAlertId) {
      teamsAlertService?.removeAlert(global_loadingAlertId);
      global_loadingAlertId = undefined;
    }
    cancelAllPromises(global_searchResultPendingPromises);
    cancelAllPromises(global_searchPendingPromises);
    await SEARCH_RESULT_BUFFER_MUTEX.runExclusive(() => {
      global_postLoadingTimer = undefined;
      global_searchResultsBuffer = [];
    });

    global_sourcesLoading.isUCSearchLoading = true;

    global_searchResultPendingPromises = [];
    global_searchPendingPromises = [];
    const aadContactIds: string[] = [];
    const userContactIds: string[] = [];
    let imageResults: TUnifiedContactsImageResponse[] = [];
    setSearchQuery(query);
    cachingService.setCachedSearchQuery(props.tenantId, query);

    // Search calls
    const aadContactsSearchPromise = getCancelablePromise(
      getSearchControllerSearchAzureAD(
        query,
        props.tenantId,
        teamsContext.clientType
      )
    );
    global_sourcesLoading.isAadLoading = true;
    aadContactsSearchPromise.promise
      .then((res) =>
        handleResult(res, () => {
          global_sourcesLoading.isAadLoading = false;
        })
      )
      .catch((error) => {
        if (!error.isCanceled) {
          global_sourcesLoading.isAadLoading = false;
          tryUpdateSearchPendingAlertMessage();
          pushSourceSearchFailedWarningAlert("AAD");
        }
      });
    global_searchResultPendingPromises.push(aadContactsSearchPromise);
    const userContactsSearchPromise = getCancelablePromise(
      getSearchControllerSearchUserContacts(
        query,
        props.tenantId,
        teamsContext.clientType
      )
    );

    global_sourcesLoading.isUserContactsLoading = true;
    userContactsSearchPromise.promise
      .then((res) =>
        handleResult(res, () => {
          global_sourcesLoading.isUserContactsLoading = false;
        })
      )
      .catch((error) => {
        if (!error.isCanceled) {
          global_sourcesLoading.isUserContactsLoading = false;
          tryUpdateSearchPendingAlertMessage();
          pushSourceSearchFailedWarningAlert("UserContact");
        }
      });
    global_searchResultPendingPromises.push(userContactsSearchPromise);
    const orgContactsSearchPromise = getCancelablePromise(
      getSearchControllerSearchOrgContacts(
        query,
        props.tenantId,
        teamsContext.clientType
      )
    );

    global_sourcesLoading.isOrgContactsLoading = true;
    orgContactsSearchPromise.promise
      .then((res) =>
        handleResult(res, () => {
          global_sourcesLoading.isOrgContactsLoading = false;
        })
      )
      .catch((error) => {
        if (!error.isCanceled) {
          global_sourcesLoading.isOrgContactsLoading = false;
          tryUpdateSearchPendingAlertMessage();
          pushSourceSearchFailedWarningAlert("OrgContact");
        }
      });
    global_searchResultPendingPromises.push(orgContactsSearchPromise);

    // SharePoint call
    global_sourcesLoading.isSharePointLoading = true;
    const sharePointContactsSearchPromise = getCancelablePromise(
      getSearchControllerSearchSharePoint(
        query,
        props.tenantId,
        teamsContext.clientType
      )
    );
    sharePointContactsSearchPromise.promise
      .then((res) =>
        handleResult(res, () => {
          global_sourcesLoading.isSharePointLoading = false;
        })
      )
      .catch((error) => {
        if (!error.isCanceled) {
          global_sourcesLoading.isSharePointLoading = false;
          tryUpdateSearchPendingAlertMessage();
          pushSourceSearchFailedWarningAlert("SharePoint");
        }
      });
    global_searchResultPendingPromises.push(sharePointContactsSearchPromise);

    // Database call
    global_sourcesLoading.isDatabaseLoading = true;
    const databaseContactsSearchPromise = getCancelablePromise(
      getSearchControllerSearchDatabase(
        query,
        props.tenantId,
        teamsContext.clientType
      )
    );
    databaseContactsSearchPromise.promise
      .then((res) =>
        handleResult(res, () => {
          global_sourcesLoading.isDatabaseLoading = false;
        })
      )
      .catch((error) => {
        if (!error.isCanceled) {
          global_sourcesLoading.isDatabaseLoading = false;
          tryUpdateSearchPendingAlertMessage();
          pushSourceSearchFailedWarningAlert("Database");
        }
      });
    global_searchResultPendingPromises.push(databaseContactsSearchPromise);

    // image & presence calls
    aadContactsSearchPromise.promise
      .then((value) => {
        // If no result was given back, we do not need to request images
        if (!value) {
          return;
        }

        value.searchResult.forEach((aadContact) => {
          if (aadContact.id) {
            aadContactIds.push(aadContact.id);
          }
        });
        const userAadPhotoPromises = [];

        for (
          let i = 0;
          i < aadContactIds.length;
          i += CONTACT_PHOTO_REQUEST_BATCH_SIZE
        ) {
          const cancelableUserAADPhotoPromise = getCancelablePromise(
            postContactsControllerGetBatchContactImages(
              aadContactIds.slice(i, i + CONTACT_PHOTO_REQUEST_BATCH_SIZE)
            )
          );
          userAadPhotoPromises.push(cancelableUserAADPhotoPromise.promise);
          global_searchPendingPromises.push(cancelableUserAADPhotoPromise);
        }
        Promise.all(userAadPhotoPromises)
          .then((results) => {
            results.forEach((result) => {
              imageResults = imageResults.concat(result);
            });
            setAllPhotosResults(imageResults);
            cachingService.setContactImageCache(props.tenantId, imageResults);
          })
          .catch((error) => {
            const typedError = error as TCancelablePromiseError;
            if (!typedError.isCanceled) {
              if (error.error) {
                console.error(error.error);
              } else {
                console.error(error);
              }
            }
            /*else: Fall through*/
          });
      })
      .catch((error) => {
        const typedError = error as TCancelablePromiseError;
        if (!typedError.isCanceled) {
          if (error.error) {
            console.error(error.error);
          } else {
            console.error(error);
          }
        }
        /*else: Fall through*/
      })
      .catch(() => {
        /* Fall through */
      }); //This is necessary to prevent a throwing of a "unhandledrejection" if the initial search fails or is canceled

    userContactsSearchPromise.promise
      .then((value) => {
        // If no result was given back, we do not need to request images
        if (!value) {
          return;
        }

        value.searchResult.forEach((userContact) => {
          if (userContact.id) {
            userContactIds.push(userContact.id);
          }
        });

        const userContactPhotoPromises = [];
        for (
          let i = 0;
          i < userContactIds.length;
          i += CONTACT_PHOTO_REQUEST_BATCH_SIZE
        ) {
          const cancelableUserContactPhotoPromises = getCancelablePromise(
            postContactsControllerGetBatchContactImages(
              userContactIds.slice(i, i + CONTACT_PHOTO_REQUEST_BATCH_SIZE)
            )
          );
          userContactPhotoPromises.push(
            cancelableUserContactPhotoPromises.promise
          );
          global_searchPendingPromises.push(cancelableUserContactPhotoPromises);
        }
        Promise.all(userContactPhotoPromises)
          .then((results) => {
            results.forEach((result) => {
              imageResults = imageResults.concat(result);
            });
            setAllPhotosResults(imageResults);
            cachingService.setContactImageCache(props.tenantId, imageResults);
          })
          .catch((error) => {
            const typedError = error as TCancelablePromiseError;
            if (!typedError.isCanceled) {
              if (error.error) {
                console.error(error.error);
              } else {
                console.error(error);
              }
            }
            /*else: Fall through*/
          });
      })
      .catch(() => {
        /* Fall through */
      }); //This is necessary to prevent a throwing of a "unhandledrejection" if the initial search fails or is canceled
  };
  const updateFavoriteFlagCallback = (
    contactId: string,
    newIsFavorite: boolean
  ): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      const searchResultToUpdate = allSearchState.allSearchResults?.find(
        (e) => e.id === contactId
      );
      if (searchResultToUpdate && searchResultToUpdate.id) {
        props
          .updateSearchResultFavoriteState(searchResultToUpdate, newIsFavorite)
          .then(() => resolve())
          .catch(() => reject());
      }
    });
  };

  // Component is remounted per tenant (key), so this runs once per tenant
  useEffect(() => {
    cancelAllPromises(global_searchResultPendingPromises);
    global_searchResultPendingPromises = [];
    global_sourcesLoading.isUCSearchLoading = false;
  }, []);

  useEffect(() => {
    updatePresence();
  }, [allSearchState.allSearchResults, updatePresence]);
  useEffect(() => {
    pollingIntervalId.current = setInterval(
      updatePresence,
      PRESENCE_UPDATE_POLLING_INTERVAL_IN_MILLISECONDS
    );
    return () => {
      if (pollingIntervalId.current) {
        clearInterval(pollingIntervalId.current);
      }
    };
  }, [updatePresence]);
  return (
    <>
      <div className="header no-select">
        <img src={headerSmallTilted} className="header__image" alt="header" />
        <img src={headerSmall} className="header__image--mobile" alt="header" />
        <div className="header__search-box">
          <p className="header__search-box__headline">
            {localizedStrings.searchPageHeadline}
          </p>
          <ControlBar
            onSearchTrigger={searchContacts}
            pendingSearch={allSearchState.loading}
          />
        </div>
      </div>
      <div className="search-page__search-results__wrapper">
        <SearchResult
          searchState={allSearchState}
          searchQuery={searchQuery}
          presence={allPresenceResults}
          photos={allPhotosResults}
          tenantId={props.tenantId}
          backendConfig={props.backendConfig}
          currentUser={props.currentUser}
          updateFavoriteFlagCallback={updateFavoriteFlagCallback}
          loadingAlertId={global_loadingAlertId}
          onSearchResultChange={onSearchResultChange}
        />
      </div>
    </>
  );
}
