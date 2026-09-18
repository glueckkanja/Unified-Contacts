import { useCallback, useEffect, useState } from "react";
import { HostClientType, HostName, app } from "@microsoft/teams-js";
import { useBoolean } from "@fluentui/react-hooks";
import localizedStrings from "../../loacalization/localization";
import {
  deleteFavoritesControllerDeleteFavorite,
  getGeneralControllerCheckConnection,
  getBackendConfig,
  getUserToken,
  putFavoritesControllerAddFavorite,
  getGeneralControllerGetVersion,
} from "../../services/ApiService";
import { FooterPage } from "../../components/Footer";
import {
  EAdminGrantCheckStatus,
  PAGE_TYPE,
} from "../../types/Enums";
import {
  TGeneralGetVersion,
  TGetBackendConfigResponse,
  TokenInfo,
  TUnifiedContactsSearchResponseSearchResult,
} from "../../types/Types";
import { FavoritesPage } from "../FavoritesPage/FavoritesPage";
import { SearchPageSearchBox } from "../SearchPage/SearchPageSearchBox";
import { cachingService } from "../../services/CachingService";
import {
  Dialog,
  Theme,
  FluentProvider,
  teamsLightTheme,
  teamsDarkTheme,
  Button,
  DialogActions,
  DialogTitle,
  DialogContent,
  DialogSurface,
  teamsHighContrastTheme,
  Toaster,
  DialogBody,
} from "@fluentui/react-components";
import { TeamsContextProvider } from "../../providers/TeamsContextProvider";
import { StaticSettings } from "../../StaticSettings";

export type TeamsPageProps = {
  pageType: PAGE_TYPE;
};

export const TeamsPage = (props: TeamsPageProps) => {
  const [additionalPermissions, setAdditionalPermissions] = useState<string[]>(
    []
  );
  const [
    isAdminGrantDialogOpen,
    { setTrue: showAdminGrantDialog, setFalse: hideAdminGrantDialog },
  ] = useBoolean(false);
  const [
    isAdditionalPermissionsGrantDialogOpen,
    setAdditionalPermissionsGrantDialogOpen,
  ] = useState<boolean>(false);
  const [hideAdditionalPermissionsGrant, setHideAdditionalPermissionsGrant] =
    useState<boolean>(false);
  const [lang, setLang] = useState<string>("en");
  const [isAppInitialized, setIsAppInitialized] = useState<boolean>(false);
  const [tenantId, setTenantId] = useState<string>(
    "7ca2c3cc-3866-4c88-8ba7-8572990c950a"
  );
  const [currentUser, setCurrentUser] = useState<TokenInfo>({
    oid: "",
    preferred_username: "",
  });
  const [theme, setTheme] = useState<Theme>();
  const [clientType, setClientType] = useState<HostClientType>();
  const [hostName, setHostName] = useState<HostName>();
  const [clientId, setCientId] = useState<string>("");
  const [adminConsentCheckStatus, setAdminConsentCheckStatus] =
    useState<EAdminGrantCheckStatus>(EAdminGrantCheckStatus.UNKNOWN);
  const [backendConfig, setBackendConfig] =
    useState<TGetBackendConfigResponse>();
  const [versionInfo, setVersionInfo] = useState<TGeneralGetVersion>();

  const updateSearchResultFavoriteState = (
    searchResultToUpdate: TUnifiedContactsSearchResponseSearchResult,
    newIsFavorite: boolean
  ): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      if (searchResultToUpdate && searchResultToUpdate.id) {
        searchResultToUpdate.isFavorite = newIsFavorite;
        let promiseSetFavorite;
        if (newIsFavorite) {
          promiseSetFavorite = putFavoritesControllerAddFavorite(
            tenantId,
            searchResultToUpdate.id
          );
        } else {
          promiseSetFavorite = deleteFavoritesControllerDeleteFavorite(
            tenantId,
            searchResultToUpdate.id
          );
        }
        let cachedSearchResults =
          cachingService.getCachedSearchResults(tenantId);
        promiseSetFavorite
          .then(() => {
            if (cachedSearchResults === undefined) {
              //first ever cachingService call on page seems to be too slow here
              cachedSearchResults =
                cachingService.getCachedSearchResults(tenantId);
            }
            if (cachedSearchResults) {
              const cacheIndex = cachedSearchResults.findIndex(
                (el) => el.id === searchResultToUpdate?.id
              );
              if (cacheIndex !== -1) {
                cachedSearchResults[cacheIndex].isFavorite = newIsFavorite;
                cachingService.setCachedSearchResults(
                  tenantId,
                  cachedSearchResults,
                  cachingService.getCachedSortSetting(tenantId)
                );
              }
            }
            resolve();
          })
          .catch(() => {
            if (searchResultToUpdate) {
              searchResultToUpdate.isFavorite = !newIsFavorite;
            }

            reject();
          });
      }
    });
  };

  function grantAdminConsent() {
    hideAdminGrantDialog();
    setHideAdditionalPermissionsGrant(true);
    cachingService.clearAdditionalPermissionsGrantSettingTimestamp();
    let adminGrantUrl = StaticSettings.adminGrantUrl;
    if (versionInfo?.edition?.toLowerCase() === "free") {
      adminGrantUrl = StaticSettings.adminGrantUrlFree;
    }
    window.open(adminGrantUrl.replace("[[clientId]]", clientId));
  }
  localizedStrings.setLanguage(lang);

  function setTeamsTheme(theme: string) {
    const body: HTMLBodyElement | null = document.querySelector("body");
    if (theme === "dark" && body) {
      body.classList.add("dark-mode");
      setTheme(teamsDarkTheme);
    } else if (theme === "contrast" && body) {
      body.classList.add("dark-mode");
      setTheme(teamsHighContrastTheme);
    } else if (theme !== "dark" && body) {
      body.classList.remove("dark-mode");
      setTheme(teamsLightTheme);
    }
  }
  const hideAdminGrantDialogSetting = () => {
    cachingService.setAdditionalPermissionsGrantSettingTimestamp();
    setHideAdditionalPermissionsGrant(true);
  };

  const checkAdminGrant = useCallback(async (): Promise<boolean> => {
    if (adminConsentCheckStatus === EAdminGrantCheckStatus.GRANTED) {
      return true;
    }

    const connectionInfo = await getGeneralControllerCheckConnection();
    if (!connectionInfo) {
      setAdminConsentCheckStatus(EAdminGrantCheckStatus.UNAUTHORIZED);
      return false;
    }

    setCientId(connectionInfo.clientId);

    // Check if Enterprise App is installed/granted in target tenant
    if (!connectionInfo.isAdminGranted) {
      setAdminConsentCheckStatus(EAdminGrantCheckStatus.NOT_ADMIN_GRANTEND);
      showAdminGrantDialog();
      return false;
    }

    // Check if all Permissions are set
    if (!connectionInfo.notGrantedPermissions.IsNullOrEmpty()) {
      setAdminConsentCheckStatus(
        EAdminGrantCheckStatus.NOT_ALL_PERMISSIONS_GRANTED
      );
      setAdditionalPermissions(connectionInfo.notGrantedPermissions);
      setAdditionalPermissionsGrantDialogOpen(true);
    }

    return true;
  }, [adminConsentCheckStatus, showAdminGrantDialog]);

  const getCurrentDatabaseInfo = useCallback(async (): Promise<void> => {
    try {
      setBackendConfig(await getBackendConfig());
    } catch (error) {
      console.error("Error while getting Database SetUp", error);
    }
  }, []);

  useEffect(() => {
    const isInitialized = app.isInitialized();
    setIsAppInitialized(isInitialized);
    if (!isInitialized) {
      app.initialize();
    }
    getUserToken().then((tokenInfo) => {
      setCurrentUser(tokenInfo);
    });
    app.registerOnThemeChangeHandler((theme) => setTeamsTheme(theme));
    app
      .getContext()
      .then((context: app.Context) => {
        setLang(context.app.locale);
        setTeamsTheme(context.app.theme);
        setClientType(context.app.host.clientType);
        setHostName(context.app.host.name);
        if (context.user) {
          if (context.user.tenant) {
            setTenantId(context.user.tenant.id);
          }
        }
        if (!isInitialized) {
          setIsAppInitialized(true);
          app.notifySuccess();
        }
      })
      .catch((error) => {
        app.notifyFailure(error);
      });
    getGeneralControllerGetVersion().then((value) => {
      if (value) {
        setVersionInfo(value);
      }
    });
    setHideAdditionalPermissionsGrant(
      cachingService.getAdditionalPermissionsGrantSetting()
    );
  }, []);

  useEffect(() => {
    // Update the document title using the browser API
    checkAdminGrant();
    getCurrentDatabaseInfo();
  }, [checkAdminGrant, getCurrentDatabaseInfo]);

  return (
    <>
      {isAppInitialized ? (
        <TeamsContextProvider clientType={clientType} hostName={hostName}>
          <FluentProvider theme={theme}>
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
            />
            <div className="teams-page__container">
              <Toaster
                toasterId="globalToastController"
                className="teams-page__alert"
              />
              {props.pageType === PAGE_TYPE.FAVORITES && (
                <FavoritesPage
                  tenantId={tenantId}
                  backendConfig={backendConfig}
                  currentUser={currentUser}
                  updateSearchResultFavoriteState={
                    updateSearchResultFavoriteState
                  }
                />
              )}
              {props.pageType === PAGE_TYPE.SEARCH && (
                <SearchPageSearchBox
                  theme={theme}
                  checkAdminGrant={checkAdminGrant}
                  tenantId={tenantId}
                  backendConfig={backendConfig}
                  currentUser={currentUser}
                  updateSearchResultFavoriteState={
                    updateSearchResultFavoriteState
                  }
                />
              )}
              <Dialog open={isAdminGrantDialogOpen}>
                <DialogSurface>
                  <DialogBody>
                    <DialogTitle>
                      {localizedStrings.adminGrantTitle}
                    </DialogTitle>
                    <DialogContent>
                      {localizedStrings.adminGrantContent}
                    </DialogContent>
                    <DialogActions>
                      <Button
                        appearance="primary"
                        onClick={() => {
                          grantAdminConsent();
                        }}
                      >
                        {localizedStrings.adminGrantButton}
                      </Button>
                    </DialogActions>
                  </DialogBody>
                </DialogSurface>
              </Dialog>
              <Dialog
                open={
                  isAdditionalPermissionsGrantDialogOpen &&
                  !hideAdditionalPermissionsGrant &&
                  !isAdminGrantDialogOpen
                }
              >
                <DialogSurface>
                  <DialogBody>
                    <DialogTitle>
                      {localizedStrings.adminGrantTitle}
                    </DialogTitle>
                    <DialogContent>
                      {
                        localizedStrings.adminGrantContentNotAllPermissionsGranted
                      }
                      {
                        <ul className="search-page__admin-grant__popover">
                          {additionalPermissions?.map((permission) => {
                            return <li key={permission}>{permission}</li>;
                          })}
                        </ul>
                      }
                    </DialogContent>
                    <DialogActions>
                      <Button
                        appearance="secondary"
                        onClick={() => {
                          hideAdminGrantDialogSetting();
                        }}
                      >
                        {localizedStrings.adminGrantCloseButton}
                      </Button>
                      <Button
                        appearance="primary"
                        onClick={() => {
                          grantAdminConsent();
                        }}
                      >
                        {localizedStrings.adminGrantButton}
                      </Button>
                    </DialogActions>
                  </DialogBody>
                </DialogSurface>
              </Dialog>
              <div className="footer__spacer" />
              <FooterPage versionInfo={versionInfo} />
            </div>
          </FluentProvider>
        </TeamsContextProvider>
      ) : (
        <div />
      )}
    </>
  );
};
