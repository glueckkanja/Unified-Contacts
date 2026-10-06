import { useCallback, useEffect, useMemo, useState } from "react";
import { StaticSettings } from "../StaticSettings";
import { Warning24Regular } from "@fluentui/react-icons";
import { Tooltip } from "@fluentui/react-tooltip";
import localizedStrings from "../loacalization/localization";
import { TGeneralGetVersion } from "../types/Types";

export type FooterProps = {
  versionInfo?: TGeneralGetVersion;
};
export const FooterPage = (props: FooterProps) => {
  const [isMobileVersion, setIsMobileVersion] = useState(false);

  const handleResize = useCallback(() => {
    if (window.innerWidth > 1100 && isMobileVersion) {
      setIsMobileVersion(false);
    } else if (window.innerWidth <= 1100 && !isMobileVersion) {
      setIsMobileVersion(true);
    }
  }, [isMobileVersion]);

  useEffect(() => {
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [handleResize]);

  const getUpdateNotification = (backendVersion?: string) => {
    if (
      !backendVersion ||
      StaticSettings.version.toLowerCase() === backendVersion.toLowerCase()
    ) {
      return <></>;
    } else {
      return (
        <Tooltip
          withArrow
          content={localizedStrings.backendFrontendOutOfSyncTooltip}
          relationship="label"
        >
          <a
            href="https://aka.c4a8.net/ucteamscacheclearing"
            target="_blank"
            rel="noopener noreferrer"
            className="footer__version-warning"
          >
            <Warning24Regular />
          </a>
        </Tooltip>
      );
    }
  };

  const getCopyrightFooter = () => {
    if (isMobileVersion) {
      return (
        <span>
          {`© ${new Date().getFullYear()} - `}
          {getUpdateNotification(props.versionInfo?.version)}
          {`${StaticSettings.version} ${props.versionInfo?.edition ?? ""}`.trim()}
        </span>
      );
    } else {
      return (
        <span>
          {`Copyright © ${new Date().getFullYear()} glueckkanja AG - `}
          {getUpdateNotification(props.versionInfo?.version)}
          {`${StaticSettings.version} ${props.versionInfo?.edition ?? ""}`.trim()}
        </span>
      );
    }
  };

  const copyrightFooter = useMemo(getCopyrightFooter, [
    isMobileVersion,
    props.versionInfo,
  ]);

  return (
    <div className="footer">
      {copyrightFooter}
      <span className="footer__element--changelog">
        <a
          href="https://aka.c4a8.net/ucchangelog"
          target="_blank"
          rel="noreferrer noopener"
        >
          Changelog
        </a>
      </span>
    </div>
  );
};
