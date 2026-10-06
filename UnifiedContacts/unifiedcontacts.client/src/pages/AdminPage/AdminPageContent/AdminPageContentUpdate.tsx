import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "react-bootstrap/esm/Button";
import Form from "react-bootstrap/esm/Form";
import Spinner from "react-bootstrap/esm/Spinner";
import { putAdminControllerSetVersionUpdateSettingsResponse } from "../../../services/ApiService";
import {
  TAdminControllerGetVersionUpdateInfo,
  TAdminPagePopoverSettings,
} from "../../../types/Types";
import SyntaxHighlighter from "react-syntax-highlighter";
import Tooltip from "react-bootstrap/esm/Tooltip";
import CopyIconRegular from "../../../assets/images/ic_fluent_copy_24_regular.svg";
import { a11yDark } from "react-syntax-highlighter/dist/esm/styles/hljs";
import OverlayTrigger from "react-bootstrap/esm/OverlayTrigger";

const installCodeRaw = `# Update Unified Contacts using GitHub Release Channel
# Channel options: "release" or "prerelease"
Update-UnifiedContacts -ReleaseChannel "{{releaseChannel}}" -AppServiceAzureUrl "{{appServiceAzureUrl}}"`;

const RELEASE_CHANNELS = {
  LATEST_RELEASE: "latest release",
  LATEST_PRERELEASE: "latest prerelease",
};

// Map display names to PowerShell module channel names
const CHANNEL_MAPPING = {
  [RELEASE_CHANNELS.LATEST_RELEASE]: "release",
  [RELEASE_CHANNELS.LATEST_PRERELEASE]: "prerelease"
};

export type AdminPageContentUpdateProps = {
  versionUpdateInfo?: TAdminControllerGetVersionUpdateInfo;
  refreshVersionUpdateInfo: () => Promise<TAdminControllerGetVersionUpdateInfo>;
  triggerPopover: (popoverSettings: TAdminPagePopoverSettings) => void;
  hidePopover: () => void;
};

export function AdminPageContentUpdate(props: AdminPageContentUpdateProps) {
  const [loadingSetVersionUpdateSettings, setLoadingSetVersionUpdateSettings] =
    useState<boolean>(false);
  const [loadingUpdateInfo, setLoadingUpdateInfo] = useState<boolean>(false);
  const [selectedChannel, setSelectedChannel] = useState<string>(
    RELEASE_CHANNELS.LATEST_RELEASE
  );
  const [prevPropsSelectedChannel, setPrevPropsSelectedChannel] =
    useState<string>();

  // Update local state when props change
  const propsSelectedChannel = props.versionUpdateInfo?.selectedChannel;
  if (propsSelectedChannel !== prevPropsSelectedChannel) {
    setPrevPropsSelectedChannel(propsSelectedChannel);
    if (propsSelectedChannel) {
      setSelectedChannel(propsSelectedChannel);
    }
  }

  const appServiceAzureUrl = props.versionUpdateInfo?.appServiceAzureUrl;
  const installCode = useMemo(() => {
    // Map the display channel name to the PowerShell module channel name
    const currentChannel = selectedChannel || RELEASE_CHANNELS.LATEST_RELEASE;
    const powershellChannelName = CHANNEL_MAPPING[currentChannel] || "release";

    return installCodeRaw
      .replaceAll("{{releaseChannel}}", powershellChannelName)
      .replaceAll(
        "{{appServiceAzureUrl}}",
        appServiceAzureUrl || "https://portal.azure.com/.../appServices"
      );
  }, [selectedChannel, appServiceAzureUrl]);

  const triggerUpdatePopover = useCallback(
    (buttonTrigger: boolean) => {
      if (
        buttonTrigger ||
        props.versionUpdateInfo?.updateInProgress === true ||
        props.versionUpdateInfo?.restartRequired === true
      ) {
        props.triggerPopover({
          canClose:
            !props.versionUpdateInfo?.updateInProgress &&
            !props.versionUpdateInfo?.restartRequired,
          header: <>Update to {props.versionUpdateInfo?.updateVersion}</>,
          body: (
            <>
              <div>
                To update Unified Contacts, please open the cloud shell in the{" "}
                <a
                  href="https://portal.azure.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Azure Portal
                </a>{" "}
                and paste the code shown below
              </div>
              <div className={`admin-page__update-tab__code-block`}>
                <div className="copy-button">
                  <OverlayTrigger
                    placement="left"
                    overlay={<Tooltip>Click to copy!</Tooltip>}
                  >
                    <Button
                      onClick={() => {
                        navigator.clipboard.writeText(installCode);
                      }}
                    >
                      <img src={CopyIconRegular} alt="Copy Icon" />
                    </Button>
                  </OverlayTrigger>
                </div>

                <SyntaxHighlighter language="powershell" style={a11yDark}>
                  {installCode}
                </SyntaxHighlighter>
              </div>
            </>
          ),
          footer: (
            <>
              {!props.versionUpdateInfo?.updateInProgress &&
                !props.versionUpdateInfo?.restartRequired && (
                  <>
                    <a
                      href="https://aka.c4a8.net/ucupdate"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      More Information
                    </a>
                    <Button
                      variant="primary"
                      onClick={() => {
                        navigator.clipboard.writeText(installCode);
                        props.hidePopover();
                      }}
                    >
                      Copy and close
                    </Button>
                  </>
                )}
            </>
          ),
        });
      }
    },
    [props, installCode]
  );

  useEffect(() => {
    triggerUpdatePopover(false);
  }, [triggerUpdatePopover]);

  function changeReleaseChannel(channelName: string) {
    setSelectedChannel(channelName); // Update local state immediately
    setLoadingSetVersionUpdateSettings(true);
    putAdminControllerSetVersionUpdateSettingsResponse({
      selectedReleaseChannel: channelName,
    })
      .then(() => {
        setLoadingUpdateInfo(true);
        setLoadingSetVersionUpdateSettings(false);
        props.refreshVersionUpdateInfo().then(() => {
          setLoadingUpdateInfo(false);
        });
      })
      .catch((error) => {
        console.error("Error changing channel:", error);
        setLoadingSetVersionUpdateSettings(false);
      });
  }

  function GetReleaseChannelSelectOptions() {
    return (
      <>
        <option value={RELEASE_CHANNELS.LATEST_RELEASE}>
          {RELEASE_CHANNELS.LATEST_RELEASE}
        </option>
        <option value={RELEASE_CHANNELS.LATEST_PRERELEASE}>
          {RELEASE_CHANNELS.LATEST_PRERELEASE}
        </option>
      </>
    );
  }

  return (
    <>
      <h1>Update</h1>
      {loadingSetVersionUpdateSettings ||
      loadingUpdateInfo ||
      !props.versionUpdateInfo ? (
        <>
          <Spinner />
        </>
      ) : (
        <>
          <Form
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            {props.versionUpdateInfo.updateAvailable ? (
              <div style={{ textAlign: "center" }}>
                <span>Update available</span>
                <h1>{props.versionUpdateInfo.updateVersion}</h1>
                <Button onClick={() => triggerUpdatePopover(true)}>
                  Update Now
                </Button>
              </div>
            ) : (
              <div style={{ textAlign: "center" }}>
                <span>No update available</span>
                <h1>Up to date</h1>
              </div>
            )}
            <Form.Group className="mb-3" controlId="appDisplayName">
              <Form.Label>Release Channel</Form.Label>
              <Form.Select
                onChange={(event) => {
                  changeReleaseChannel(event.target.value);
                }}
                value={selectedChannel}
              >
                {GetReleaseChannelSelectOptions()}
              </Form.Select>
              <Form.Text className="text-muted">
                Select your desired release channel. We highly recommend the
                latest release channel. If you want to be the first to
                experience new features select the prerelease channel.
              </Form.Text>
            </Form.Group>
          </Form>
        </>
      )}
      <hr />
      <div className="admin-page__content__overview__changelog">
        <iframe
          title="Unified Contacts Changelog"
          src="https://embed-150939884.sleekplan.app/#/changelog/"
        ></iframe>
      </div>
    </>
  );
}
