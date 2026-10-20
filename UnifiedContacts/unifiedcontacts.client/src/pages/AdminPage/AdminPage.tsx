import { AdminPageHeader } from "./AdminPageHeader";
import { AdminPageProductOverview } from "./AdminPageProductOverview";
import { AdminPageSideNavbar } from "./AdminPageSideNavbar";
import { AdminPageContentTabs } from "./AdminPageContent/Generic/AdminPageContentTabs";
import { AdminPageContent } from "./AdminPageContent/Generic/AdminPageContent";
import { useEffect, useState } from "react";
import {
  getAdminControllerGetIsUpdateInProgress,
  getAdminControllerGetManifestInfo,
  getAdminControllerGetVersionUpdateInfo,
  getGeneralControllerGetVersion,
  getMetrics,
  postAdminControllerUploadManifestInfo,
} from "../../services/ApiService";
import { AdminPageContentManifestGenerator } from "./AdminPageContent/AdminPageContentManifestGenerator";
import { AdminPageContentOverview } from "./AdminPageContent/AdminPageContentOverview";
import { AdminPageContentUpdate } from "./AdminPageContent/AdminPageContentUpdate";
import {
  TCancelablePromise,
  TAdminControllerGetIsUpdateInProgressResponse,
  TAdminControllerGetManifestInfo,
  TAdminControllerGetVersionUpdateInfo,
  TAdminPagePopoverSettings,
  TCancelablePromiseError,
  TGeneralGetVersion,
  TAdminPageMetrics,
} from "../../types/Types";
import { getCancelablePromise } from "../../services/PromiseService";
import { AdminPagePopover } from "./AdminPageContent/Generic/AdminPagePopover";
import Button from "react-bootstrap/esm/Button";
import { AdminPageContentSettings } from "./AdminPageContent/AdminPageContentSettings";
import { AdminPageEnvironmentContextProvider } from "../../providers/AdminPageEnvironmentContextProvider";

const UPDATE_PENDING_REFRESH_CYCLE_MS_DURING_UPDATE = 5000;
const UPDATE_PENDING_REFRESH_CYCLE_MS_DEFAULT = 30000;

export function AdminPage() {
  const [activeTabKey, setActiveTabKey] = useState<string>("overview");
  const [popoverSettings, setPopoverSettings] =
    useState<TAdminPagePopoverSettings>();
  const [showPopover, setShowPopover] = useState<boolean>(false);

  const [versionUpdateInfo, setVersionUpdateInfo] =
    useState<TAdminControllerGetVersionUpdateInfo>({});
  const [teamsManifestInfo, setTeamsManifestInfo] =
    useState<TAdminControllerGetManifestInfo>();
  const [versionInfo, setVersionInfo] = useState<TGeneralGetVersion>();
  const[adminPageMetrics, setAdminPageMetrics] = useState<TAdminPageMetrics>();
  enum UpdatePendingRefreshTimer {
    NONE,
    DEFAULT,
    DURING_UPDATE,
  }

  let refreshUpdatePendingTimer: NodeJS.Timeout | undefined;
  let refreshUpdatePendingPromise:
    | TCancelablePromise<TAdminControllerGetIsUpdateInProgressResponse>
    | undefined;
  let activeTimer: UpdatePendingRefreshTimer = UpdatePendingRefreshTimer.NONE;

  function scheduleUpdatePendingRefreshDefault(): void {
    if (refreshUpdatePendingTimer) {
      clearInterval(refreshUpdatePendingTimer);
    }
    refreshUpdatePendingTimer = setInterval(
      refreshUpdatePending,
      UPDATE_PENDING_REFRESH_CYCLE_MS_DEFAULT
    );
    activeTimer = UpdatePendingRefreshTimer.DEFAULT;
  }

  function scheduleUpdatePendingRefreshDuringUpdate(): void {
    if (refreshUpdatePendingTimer) {
      clearInterval(refreshUpdatePendingTimer);
    }
    refreshUpdatePendingTimer = setInterval(
      refreshUpdatePending,
      UPDATE_PENDING_REFRESH_CYCLE_MS_DURING_UPDATE
    );
    activeTimer = UpdatePendingRefreshTimer.DURING_UPDATE;
  }

  function clearUpdatePendingRefreshSchedule(): void {
    if (refreshUpdatePendingTimer) {
      clearInterval(refreshUpdatePendingTimer);
    }
    refreshUpdatePendingTimer = undefined;
    activeTimer = UpdatePendingRefreshTimer.NONE;
  }

  function refreshUpdatePending(): void {
    refreshUpdatePendingPromise?.cancel();
    refreshUpdatePendingPromise = getCancelablePromise(
      getAdminControllerGetIsUpdateInProgress()
    );
    refreshUpdatePendingPromise.promise
      .then((res) => {
        setVersionUpdateInfo((oldVersionUpdateInfo) => {
          const newVersionUpdateInfo = {
            ...oldVersionUpdateInfo,
          };
          newVersionUpdateInfo.updateInProgress = res.isUpdateInProgress;
          newVersionUpdateInfo.restartRequired = res.restartRequired;
          return newVersionUpdateInfo;
        });

        // if restart is required and no update is pending no further requests to the backend are necessary
        if (
          !res.isUpdateInProgress &&
          res.restartRequired &&
          refreshUpdatePendingTimer
        ) {
          clearUpdatePendingRefreshSchedule();
        }
        // If we are currently in DURING UPDATE schedule and no update is in progress reset back to DEFAULT schedule
        else if (
          activeTimer === UpdatePendingRefreshTimer.DURING_UPDATE &&
          !res.isUpdateInProgress
        ) {
          scheduleUpdatePendingRefreshDefault();
        }
        // If we are currently in DEFAULT schedule and an update is pending - change to DURING UPDATE schedule
        else if (
          activeTimer === UpdatePendingRefreshTimer.DEFAULT &&
          res.isUpdateInProgress
        ) {
          scheduleUpdatePendingRefreshDuringUpdate();
        }
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
  }

  useEffect(() => {
    getGeneralControllerGetVersion().then((value) => {
      if (value) {
        setVersionInfo(value);
      }
    });
    getAdminControllerGetVersionUpdateInfo().then((res) => {
      setVersionUpdateInfo(res);
      if (res.updateInProgress) {
        scheduleUpdatePendingRefreshDuringUpdate();
      } else {
        scheduleUpdatePendingRefreshDefault();
      }
    });
    getMetrics().then((res) => {
      setAdminPageMetrics(res);
    });
    getAdminControllerGetManifestInfo().then((res) => {
      setTeamsManifestInfo(res);
      if (!res.teamsManifestExists) {
        triggerPopover({
          canClose: true,
          header: <>No Teams Manifest published</>,
          body: (
            <>
              Unified Contacts can&apos;t be found in Teams currently. Please go
              to the Teams Manifest tab to configure the Teams Manifest and
              upload it to your tenant
            </>
          ),
          footer: (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setActiveTabKey("manifest");
                  hidePopover();
                }}
              >
                Go to Teams Manifest tab
              </Button>
              <Button variant="primary" onClick={hidePopover}>
                Ok
              </Button>
            </>
          ),
        });
      } else if (res.teamsManifestUpdatePossible) {
        triggerPopover({
          canClose: false,
          header: <>Teams Manifest update necessary</>,
          body: (
            <>
              The Unified Contacts version does not match your published Teams
              app version! <br /> You need to update the Teams Manifest to
              complete the update.
              <br /> If you want to change the manifest meta information (e.g.
              description) make sure to do it <b>before</b> uploading the
              manifest.
            </>
          ),
          footer: (
            <>
              <Button
                variant="primary"
                onClick={() => {
                  setActiveTabKey("manifest");
                  hidePopover();
                }}
              >
                Go to Teams Manifest tab
              </Button>
            </>
          ),
        });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function refreshVersionUpdateInfo(): Promise<TAdminControllerGetVersionUpdateInfo> {
    const promise = getAdminControllerGetVersionUpdateInfo();
    promise.then((res) => {
      setVersionUpdateInfo(res);
    });
    return promise;
  }

  function uploadManifest(): Promise<void> {
    return postAdminControllerUploadManifestInfo().then(() => {
      if (teamsManifestInfo) {
        setTeamsManifestInfo((oldTeamsManifestInfo) => {
          let newTeamsManifestInfo: TAdminControllerGetManifestInfo;
          if (!oldTeamsManifestInfo) {
            newTeamsManifestInfo = {
              ...teamsManifestInfo,
            };
          } else {
            newTeamsManifestInfo = {
              ...oldTeamsManifestInfo,
            };
          }

          newTeamsManifestInfo.teamsManifestUpdatePossible = false;
          newTeamsManifestInfo.teamsManifestExists = true;
          return newTeamsManifestInfo;
        });
      } else {
        getAdminControllerGetManifestInfo().then((res) => {
          setTeamsManifestInfo(res);
        });
      }
    });
  }

  function triggerPopover(newPopoverSettings: TAdminPagePopoverSettings) {
    setPopoverSettings(newPopoverSettings);
    setShowPopover(true);
  }

  function hidePopover() {
    setShowPopover(false);
  }

  return (
    <AdminPageEnvironmentContextProvider versionInfo={versionInfo}>
      <div className="admin-page__background">
        <AdminPageHeader />
        <div className="admin-page__body">
          <AdminPageSideNavbar />
          <AdminPageProductOverview
            versionUpdateInfo={versionUpdateInfo}
            setActiveTabKey={setActiveTabKey}
          />
          <AdminPageContentTabs
            activeTabKey={activeTabKey}
            onTabSelect={setActiveTabKey}
          >
            <AdminPageContent tabKey="overview" tabTitle="Overview">
              <AdminPageContentOverview metrics={adminPageMetrics}/>
            </AdminPageContent>
            <AdminPageContent tabKey="settings" tabTitle="Settings">
              <AdminPageContentSettings />
            </AdminPageContent>
            <AdminPageContent tabKey="manifest" tabTitle="Teams Manifest">
              <AdminPageContentManifestGenerator
                teamsManifestInfo={teamsManifestInfo}
                uploadManifest={uploadManifest}
              />
            </AdminPageContent>
            <AdminPageContent tabKey="update" tabTitle="Update">
              <AdminPageContentUpdate
                refreshVersionUpdateInfo={refreshVersionUpdateInfo}
                versionUpdateInfo={versionUpdateInfo}
                triggerPopover={triggerPopover}
                hidePopover={hidePopover}
              />
            </AdminPageContent>
          </AdminPageContentTabs>
        </div>
      </div>
      {popoverSettings && (
        <AdminPagePopover
          popoverSettings={popoverSettings}
          show={showPopover}
          onHide={hidePopover}
        />
      )}
    </AdminPageEnvironmentContextProvider>
  );
}
