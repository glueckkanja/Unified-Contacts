import localizedStrings from "../loacalization/localization";
import shapeProductsUnifiedContacts from "../assets/images/shape-products-unified-contacts.svg";
import {
  TUnfiedSearchState,
  TokenInfo,
  TUnifiedContactsImageResponse,
  TUnifiedContactsPresenceResponse,
  TUnifiedContactsSearchResponseSearchResult,
  TGetBackendConfigResponse,
} from "../types/Types";
import { useEffect, useMemo, useState, useCallback, useContext } from "react";
import { LoadingAnimation } from "./LoadingAnimation";
import { SORT_CATEGORY, SORT_TYPE, TILE_FORMAT } from "../types/Enums";
import { Tile } from "./Tile";
import { cachingService } from "../services/CachingService";
import { compareSearchResults } from "../services/SortService";
import LargeTileIcon from "./Icons/LargeTileIcon";
import SmallTileIcon from "./Icons/SmallTileIcon";
import { Button } from "@fluentui/react-components";
import {
  ArrowSort24Regular,
  ArrowSortDown24Regular,
  ArrowSortUp24Regular,
} from "@fluentui/react-icons";
import { TeamsPageAlertServiceContext } from "../providers/TeamsPageAlertServiceContextProvider";
const TILE_SIZE_REM = 30;
const TILE_COLUMN_GAP_REM = 1;

const calculateResultCardContainerWidth = (): number | undefined => {
  if (window.innerWidth <= 1100) {
    // Mobile version
    return undefined;
  }
  // Desktop version
  const remFactor = parseFloat(
    getComputedStyle(document.documentElement).fontSize
  );
  const tileSizeInPx = TILE_SIZE_REM * remFactor;
  let contentWidth = window.innerWidth - 2 * (3 * remFactor); //Total width - padding left and right
  contentWidth ??= 600;
  const tileCountMax = Math.floor(contentWidth / tileSizeInPx);
  return (
    tileCountMax * tileSizeInPx +
    (tileCountMax - 1) * TILE_COLUMN_GAP_REM * remFactor
  );
};
export type SearchResultProps = {
  searchState: TUnfiedSearchState;
  presence: TUnifiedContactsPresenceResponse[];
  photos: TUnifiedContactsImageResponse[];
  searchQuery?: string;
  tenantId: string;
  backendConfig?: TGetBackendConfigResponse;
  currentUser: TokenInfo;
  loadingAlertId?: string;
  onSearchResultChange: (searchState: TUnfiedSearchState) => void;
  updateFavoriteFlagCallback: (
    contactId: string,
    newIsFavorite: boolean
  ) => Promise<void>;
};

export function SearchResult(props: SearchResultProps) {
  const teamsAlertService = useContext(TeamsPageAlertServiceContext);

  const [resultCardContainerWidth, setResultCardContainerWidth] = useState<
    number | undefined
  >(calculateResultCardContainerWidth);
  let cachedTileSize = cachingService.getUserSettings().selectedTileSize;
  if (!cachedTileSize) {
    cachedTileSize =
      window.innerWidth && window.innerWidth < 1100
        ? TILE_FORMAT.SMALL
        : TILE_FORMAT.LARGE;
  }
  const [tileSize, setTileSize] = useState<TILE_FORMAT>(cachedTileSize);

  const handleResize = useCallback(() => {
    setResultCardContainerWidth(calculateResultCardContainerWidth());
  }, []);

  const updateTileSize = (tileSize: TILE_FORMAT) => {
    setTileSize(tileSize);
    cachingService.setTileSizeUserSetting(tileSize);
  };

  const sortIcon = useMemo(() => {
    if (props.searchState.allSearchResults) {
      if (props.searchState.sortSetting.sortType === SORT_TYPE.ASCENDING) {
        return <ArrowSortUp24Regular />;
      } else if (
        props.searchState.sortSetting.sortType === SORT_TYPE.DESCENDING
      ) {
        return <ArrowSortDown24Regular />;
      } else {
        return <ArrowSort24Regular />;
      }
    } else {
      return <ArrowSort24Regular />;
    }
  }, [props.searchState.sortSetting, props.searchState.allSearchResults]);

  const sortSearchResult = () => {
    let searchResultsBuffer: TUnifiedContactsSearchResponseSearchResult[] = [];
    if (props.loadingAlertId && !props.searchState.loading && teamsAlertService) {
      teamsAlertService.removeAlert(props.loadingAlertId);
    }
    if (props.searchState.allSearchResults) {
      if (
        props.searchState.sortSetting.sortType === SORT_TYPE.DESCENDING ||
        props.searchState.sortSetting.sortType === SORT_TYPE.UNSORTED
      ) {
        searchResultsBuffer =
          props.searchState.allSearchResults.sort(compareSearchResults);
        props.onSearchResultChange({
          loading: false,
          allSearchResults: [...searchResultsBuffer],
          sortSetting: {
            sortType: SORT_TYPE.ASCENDING,
            sortCategory: SORT_CATEGORY.DISPLAYNAME,
          },
        });
      } else {
        searchResultsBuffer = props.searchState.allSearchResults
          .sort(compareSearchResults)
          .reverse();
        props.onSearchResultChange({
          loading: false,
          allSearchResults: [...searchResultsBuffer],
          sortSetting: {
            sortType: SORT_TYPE.DESCENDING,
            sortCategory: SORT_CATEGORY.DISPLAYNAME,
          },
        });
      }
    }
  };
  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [handleResize]);

  const searchResults = useMemo(() => {
    return (
      <>
        {props.searchState.allSearchResults?.map((searchResult) => {
          return (
            <Tile
              key={searchResult.id}
              searchResult={searchResult}
              presence={props.presence.find(
                (e) => e.contactId === searchResult.id
              )}
              photo={props.photos.find((e) => e.contactId === searchResult.id)}
              tenantId={props.tenantId}
              backendConfig={props.backendConfig}
              currentUser={props.currentUser}
              updateFavoriteFlagCallback={props.updateFavoriteFlagCallback}
              tileSize={tileSize}
            />
          );
        })}
      </>
    );
  }, [
    props.searchState,
    props.presence,
    props.photos,
    props.backendConfig,
    props.tenantId,
    tileSize,
    props.currentUser,
    props.updateFavoriteFlagCallback,
  ]);

  if (props.searchState.loading) {
    return (
      <div className="no-select">
        <div className="search-result__loading-spinner no-select">
          <LoadingAnimation />
        </div>
      </div>
    );
  } else if (props.searchState.allSearchResults === undefined) {
    return (
      <div className="search-result__landing-page no-select">
        <div>
          <img
            src={shapeProductsUnifiedContacts}
            alt="Unified Contacts Logo"
            className="search-result__landing-page__logo no-select"
            draggable={false}
          />
          <p className="search-result__landing-page__welcome-text no-select">
            {localizedStrings.welcomeText}
          </p>
          <p className="no-select">{localizedStrings.emptyPageSubTitle}</p>
        </div>
      </div>
    );
  } else {
    return (
      <div className="search-result__container">
        <div className="clear-both">
          <div>
            <div style={{ width: resultCardContainerWidth, margin: "auto" }}>
              <div className="search-result__bar">
                <div className="search-result__search-query-display no-select">
                  <div className="search-result__search-query-prefix">
                    {localizedStrings.searchResultString}
                  </div>{" "}
                  &quot;{props.searchQuery}&quot;
                </div>
                <div className="search-result__result-stats no-select">
                  {props.searchState.allSearchResults.length}{" "}
                  {props.searchState.allSearchResults.length === 1
                    ? localizedStrings.resultsStringSingular
                    : localizedStrings.resultsString}
                </div>
                {props.searchState.allSearchResults.length > 0 && (
                  <div className="search-result__control-bar">
                    <div className="search-result__control-bar__view-control">
                      <Button
                        className="button-group--right"
                        icon={<LargeTileIcon />}
                        key={TILE_FORMAT.LARGE}
                        onClick={() => updateTileSize(TILE_FORMAT.LARGE)}
                        appearance={
                          tileSize === TILE_FORMAT.LARGE
                            ? "primary"
                            : "secondary"
                        }
                      />
                      <Button
                        className="button-group--left"
                        icon={<SmallTileIcon />}
                        key={TILE_FORMAT.SMALL}
                        onClick={() => updateTileSize(TILE_FORMAT.SMALL)}
                        appearance={
                          tileSize === TILE_FORMAT.SMALL
                            ? "primary"
                            : "secondary"
                        }
                      />
                    </div>
                    <div className="search-result__control-bar__sort-control">
                      <Button
                        appearance="transparent"
                        icon={sortIcon}
                        onClick={sortSearchResult}
                      >
                        {localizedStrings.name}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="search-result__result-card">{searchResults}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
