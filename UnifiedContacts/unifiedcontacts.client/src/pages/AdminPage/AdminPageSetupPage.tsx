import { useEffect, useRef, useState } from "react";
import unifiedContactsLogo from "../../assets/images/shape-products-unified-contacts.svg";
import SyntaxHighlighter from "react-syntax-highlighter";
import Button from "react-bootstrap/esm/Button";
import CopyIconRegular from "../../assets/images/ic_fluent_copy_24_regular.svg";
import Overlay from "react-bootstrap/esm/Overlay";
import Tooltip from "react-bootstrap/esm/Tooltip";
import { a11yDark } from "react-syntax-highlighter/dist/esm/styles/hljs";

const installCode = `Install-Module UnifiedContactsPS

$sqlCredentials = Get-Credential
Install-UnifiedContacts -SqlCredential $sqlCredentials -AppServiceAzureUrl "https://portal.azure.com/.../appServices"`;

export function AdminPageSetupPage() {
  const [headerVisible, setHeaderVisible] = useState<boolean>(false);
  const [descriptionVisible, setDescriptionVisible] = useState<boolean>(false);
  const [codeBlockVisible, setCodeBlockVisible] = useState<boolean>(false);
  const [showCopiedTooltip, setShowCopiedTooltip] = useState<boolean>(false);

  const copyButtonTarget = useRef(null);

  useEffect(() => {
    setTimeout(() => {
      setHeaderVisible(true);
    }, 400);
    setTimeout(() => {
      setDescriptionVisible(true);
    }, 800);
    setTimeout(() => {
      setCodeBlockVisible(true);
    }, 1200);
  }, []);
  return (
    <div className="admin-page__setup-page__container">
      <div className="admin-page__setup-page__content-wrapper">
        <img
          src={unifiedContactsLogo}
          alt="Unified Contacts Logo"
          className="admin-page__setup-page__logo admin-page__setup-page__animated"
        />
        <h1
          className={
            headerVisible
              ? "admin-page__setup-page__animated"
              : "admin-page__setup-page__animation-delayed"
          }
        >
          Welcome to Unified Contacts
        </h1>
        <div
          className={
            descriptionVisible
              ? "admin-page__setup-page__animated"
              : "admin-page__setup-page__animation-delayed"
          }
        >
          We need to do some additional setup steps. Please run the below
          Powershell script in your{" "}
          <a
            href="https://portal.azure.com/#home"
            target="_blank"
            rel="noopener noreferrer"
          >
            Azure Cloud Shell
          </a>
          .
          <br />
          For mor information visit our{" "}
          <a
            href="https://docs.unified-contacts.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            installation guide
          </a>
          .
        </div>
        <div
          className={`admin-page__setup-page__code-block ${
            codeBlockVisible
              ? "admin-page__setup-page__animated"
              : "admin-page__setup-page__animation-delayed"
          }`}
        >
          <div className="copy-button">
            <Button
              ref={copyButtonTarget}
              onClick={() => {
                navigator.clipboard.writeText(installCode);
                setShowCopiedTooltip(true);
              }}
              onBlur={() => setShowCopiedTooltip(false)}
            >
              <img src={CopyIconRegular} alt="Copy Icon" />
            </Button>
            <Overlay
              target={copyButtonTarget}
              show={showCopiedTooltip}
              placement="top"
            >
              {(props) => <Tooltip {...props}>Copied!</Tooltip>}
            </Overlay>
          </div>

          <SyntaxHighlighter language="powershell" style={a11yDark}>
            {installCode}
          </SyntaxHighlighter>
        </div>
      </div>
    </div>
  );
}
