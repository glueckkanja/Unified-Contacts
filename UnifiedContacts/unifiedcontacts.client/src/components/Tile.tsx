import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTrigger,
  Persona,
  Tooltip,
} from "@fluentui/react-components";
import {
  Building24Regular,
  Mention24Regular,
  Phone24Regular,
  Star28Filled,
  Copy24Regular,
  Dismiss24Regular,
  BuildingSkyscraper24Regular,
  PeopleCommunity24Regular,
  Person24Regular,
  Location24Regular,
} from "@fluentui/react-icons";
import {
  TGetBackendConfigResponse,
  TokenInfo,
  TUnifiedContactsImageResponse,
  TUnifiedContactsPresenceResponse,
  TUnifiedContactsSearchResponseSearchResult,
} from "../types/Types";
import { useBoolean, useId } from "@fluentui/react-hooks";
import { ReactElement, useEffect, useState } from "react";
import { TileButtonAction } from "./TileButtonAction";
import TileContactInfo from "./TileContactInfo";
import { presenceMappingService } from "../services/presenceMappingService";
import localizedStrings from "../loacalization/localization";
import SourceIcon from "./Icons/SourceIcon";
import { SOURCE, TILE_FORMAT } from "../types/Enums";
import { clipboard } from "@microsoft/teams-js";

type TileProps = {
  tileSize: string;
  searchResult: TUnifiedContactsSearchResponseSearchResult;
  presence?: TUnifiedContactsPresenceResponse;
  photo?: TUnifiedContactsImageResponse;
  tenantId: string;
  backendConfig?: TGetBackendConfigResponse;
  currentUser: TokenInfo;
  updateFavoriteFlagCallback: (
    contactId: string,
    newIsFavorite: boolean
  ) => Promise<void>;
};

export function Tile(props: TileProps) {
  let image = "";
  let phoneBusinessArray: string[] = [];
  let phoneArray: string[] = [];
  let phoneMobileArray: string[] = [];
  let emailArray: string[] = [];
  let imEmailArray: string[] = [];
  const addressArray: string[] = [];
  const emailArrayHTML: ReactElement[] = [];
  const phoneMobileArrayHTML: ReactElement[] = [];
  let sourceName = "";
  const phoneBusinessArrayHTML: ReactElement[] = [];

  const [isFavorite, setIsFavorite] = useState(
    props.searchResult.isFavorite ? props.searchResult.isFavorite : false
  );
  const [isCurrentUser, { setTrue: setIsCurrentUserTrue }] = useBoolean(false);
  const [hovered, setHovered] = useState(false);
  const personaId = useId("persona-coin");
  const emailButtonId = useId("callout-button");
  const phoneButtonId = useId("callout-button");
  const videoButtonId = useId("callout-button");
  const messageButtonId = useId("callout-button");

  function copyToClipBoardLegacy(value: string) {
    const textArea = document.createElement("textarea");
    textArea.value = value;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
  }

  function copyToClipBoard(value: string) {
    if (clipboard.isSupported() === true) {
      clipboard.write(new Blob([value], { type: "text/plain" })).catch(() => {
        copyToClipBoardLegacy(value);
      });
    } else {
      copyToClipBoardLegacy(value);
    }
  }

  if (props.searchResult.addresses) {
    if (props.searchResult.addresses.business?.IsNullOrEmpty() === false) {
      props.searchResult.addresses.business.forEach((address) => {
        if (address.addressAltString) {
          addressArray.push(address.addressAltString);
        }
      });
    }

    if (props.searchResult.addresses.home?.IsNullOrEmpty() === false) {
      props.searchResult.addresses.home.forEach((address) => {
        if (address.addressAltString) {
          addressArray.push(address.addressAltString);
        }
      });
    }

    if (props.searchResult.addresses.other?.IsNullOrEmpty() === false) {
      props.searchResult.addresses.other.forEach((address) => {
        if (address.addressAltString) {
          addressArray.push(address.addressAltString);
        }
      });
    }
  }

  if (props.searchResult.phoneNumbers) {
    if (props.searchResult.phoneNumbers.business?.IsNullOrEmpty() === false) {
      props.searchResult.phoneNumbers.business.forEach((phoneNumber) => {
        phoneBusinessArray.push(phoneNumber);
      });
    }
    if (props.searchResult.phoneNumbers.mobile?.IsNullOrEmpty() === false) {
      props.searchResult.phoneNumbers.mobile.forEach((phoneNumber) => {
        phoneMobileArray.push(phoneNumber);
      });
    }
    if (props.searchResult.phoneNumbers.home?.IsNullOrEmpty() === false) {
      props.searchResult.phoneNumbers.home.forEach((phoneNumber) => {
        phoneBusinessArray.push(phoneNumber);
      });
    }
  }

  if (props.searchResult.mailAddresses?.IsNullOrEmpty() === false) {
    props.searchResult.mailAddresses.forEach((mail) => {
      emailArray.push(mail);
    });
  }

  if (props.searchResult.imAddresses?.IsNullOrEmpty() === false) {
    props.searchResult.imAddresses.forEach((mail) => {
      imEmailArray.push(mail);
    });
  }

  phoneBusinessArray = phoneBusinessArray.filter((element) => {
    return element?.IsNullOrEmpty() === false;
  });

  imEmailArray = imEmailArray.filter((element) => {
    return element?.IsNullOrEmpty() === false;
  });

  phoneMobileArray = phoneMobileArray.filter((element) => {
    return element?.IsNullOrEmpty() === false;
  });

  emailArray = emailArray.filter((element) => {
    return element?.IsNullOrEmpty() === false;
  });

  phoneArray = phoneBusinessArray.concat(phoneMobileArray);

  useEffect(() => {
    let currentTilesImAdress = "";
    if (props.searchResult.imAddresses && props.searchResult.imAddresses[0]) {
      currentTilesImAdress = props.searchResult.imAddresses[0].toLowerCase();
    } else if (emailArray.length > 0) {
      currentTilesImAdress = emailArray[0].toLowerCase();
    }
    if (
      (props.currentUser.oid === props.searchResult.id?.split("_")[1] ||
        props.currentUser.preferred_username.toLowerCase() ===
          currentTilesImAdress) &&
      !isCurrentUser
    ) {
      setIsCurrentUserTrue();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  emailArray.forEach((item) => {
    emailArrayHTML.push(
      <div style={{ display: "flex" }}>
        <p style={{ marginRight: "5px" }}>{item}</p>
        <Button
          className="copy-icon"
          appearance="transparent"
          icon={<Copy24Regular />}
          onClick={() => copyToClipBoard(item)}
        />
      </div>
    );
  });
  phoneMobileArray.forEach((item) => {
    phoneMobileArrayHTML.push(
      <div style={{ display: "flex" }}>
        <p style={{ marginRight: "5px" }}>{item}</p>
        <Button
          className="copy-icon"
          appearance="transparent"
          icon={<Copy24Regular />}
          onClick={() => copyToClipBoard(item)}
        />
      </div>
    );
  });
  phoneBusinessArray.forEach((item) => {
    phoneBusinessArrayHTML.push(
      <div style={{ display: "flex" }}>
        <p style={{ marginRight: "5px" }}>{item}</p>
        <Button
          className="copy-icon"
          appearance="transparent"
          icon={<Copy24Regular />}
          onClick={() => copyToClipBoard(item)}
        />
      </div>
    );
  });

  if (props.photo?.imageType === "BASE64" && props.photo.imageData) {
    image = `data:image/png;base64,${props.photo?.imageData}`;
  } else if (props.photo?.imageType === "URL" && props.photo.imageData) {
    image = props.photo.imageData;
  }
  if (addressArray.length < 1) {
    addressArray.push("");
  }
  if (props.searchResult.subSource) {
    sourceName = props.searchResult.subSource;
  } else if (props.searchResult.source) {
    switch (props.searchResult.source) {
      case SOURCE.AZURE_AD:
        sourceName = "Entra ID";
        break;
      case SOURCE.ORG_CONTACT:
        sourceName = "Outlook";
        break;
      case SOURCE.USER_CONTACT:
        sourceName = "Outlook";
        break;
      case SOURCE.SHAREPOINT:
        sourceName = "SharePoint";
        break;
      case SOURCE.DATABASE:
        sourceName = "Database";
    }
  }

  const toggleFavorite = (e: React.MouseEvent<HTMLInputElement>) => {
    e.preventDefault();
    setIsFavorite(!isFavorite);
    if (props.searchResult.id) {
      props
        .updateFavoriteFlagCallback(props.searchResult.id, !isFavorite)
        .catch(() => {
          setIsFavorite(isFavorite);
        });
    }
  };

  return (
    <Dialog>
      <div
        className={"tile" + (hovered ? " tile--hover" : "")}
        id={props.searchResult.id}
      >
        <DialogTrigger>
          <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <div className="source-icon">
              <Tooltip
                content={localizedStrings.foundIn.replace(
                  "({source})",
                  sourceName
                )}
                relationship="label"
              >
                <div>
                  <SourceIcon sourceType={props.searchResult.source} />
                </div>
              </Tooltip>
            </div>
            <div className="tile__contact-overview">
              <div className="tile__contact-overview__favorite-star-container">
                {
                  //check database to see if free standalone
                  props.backendConfig &&
                    props.backendConfig.isDatabaseConfigured && (
                      <div onClick={toggleFavorite}>
                        <Star28Filled
                          className={`tile__favorite-icon ${
                            isFavorite && "selected"
                          }`}
                        />
                      </div>
                    )
                }
                <Persona
                  id={personaId}
                  avatar={{
                    image: {
                      src: image,
                    },
                  }}
                  size={window.innerWidth < 1100 ? "large" : "huge"}
                  className={
                    "tile__persona__suppress-pointer-events tile__persona " +
                    (isFavorite && " tile__persona--highlight-selected")
                  }
                  presence={{ status: presenceMappingService(props.presence) }}
                />
              </div>
              <div
                className={`tile__contact-metadata-container ${
                  props.tileSize === TILE_FORMAT.SMALL && "tile--small"
                }`}
              >
                <p className="tile__contact-displayname">
                  {props.searchResult.displayName}
                </p>
                <div className="tile__contact-metadata">
                  <p>{props.searchResult.companyName}</p>
                  <p>{props.searchResult.department}</p>
                  {props.tileSize === TILE_FORMAT.LARGE && (
                    <>
                      <p>{props.searchResult.jobTitle}</p>
                      {addressArray.length > 0 && <p>{addressArray[0]}</p>}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogTrigger>
        {props.tileSize === TILE_FORMAT.LARGE && (
          <>
            <hr className="tile__hr tile--large" />
            <div className="tile__contact-info-container">
              <div className="tile__contact-info">
                <Phone24Regular className="tile__contact-info__info-type-icon" />
                <TileContactInfo
                  intputArray={phoneMobileArray}
                  copyToClipBoard={copyToClipBoard}
                />
              </div>
              <div className="tile__contact-info">
                <Building24Regular className="tile__contact-info__info-type-icon" />
                <TileContactInfo
                  intputArray={phoneBusinessArray}
                  copyToClipBoard={copyToClipBoard}
                />
              </div>
              <div className="tile__contact-info">
                <Mention24Regular className="tile__contact-info__info-type-icon" />
                <TileContactInfo
                  intputArray={emailArray}
                  copyToClipBoard={copyToClipBoard}
                />
              </div>
            </div>
          </>
        )}

        <div
          className={`tile__action-items ${
            props.tileSize === TILE_FORMAT.SMALL && "tile--small"
          }`}
        >
          <TileButtonAction
            imEmailArray={imEmailArray}
            emailArray={emailArray}
            phoneArray={phoneArray}
            isCurrentUser={isCurrentUser}
            messageButtonId={messageButtonId}
            emailButtonId={emailButtonId}
            phoneButtonId={phoneButtonId}
            videoButtonId={videoButtonId}
          />
        </div>
      </div>
      <DialogSurface className="tile__detail-dialog">
        <DialogBody>
          <DialogContent className="tile__detailed-dialog__content">
            <div>
              <div
                className="tile__detail-dialog__header"
                style={{ position: "relative" }}
              >
                {
                  //check database to see if free standalone
                  props.backendConfig &&
                    props.backendConfig.isDatabaseConfigured && (
                      <div onClick={toggleFavorite}>
                        <Star28Filled
                          className={`tile__favorite-icon ${
                            isFavorite && "selected"
                          }`}
                        />
                      </div>
                    )
                }
                <Persona
                  id={personaId}
                  avatar={{
                    image: {
                      src: image,
                    },
                  }}
                  size={window.innerWidth < 1100 ? "large" : "huge"}
                  className={
                    "tile__persona__suppress-pointer-events tile__persona " +
                    (isFavorite && " tile__persona--highlight-selected")
                  }
                  presence={{ status: presenceMappingService(props.presence) }}
                />
                <p className="tile__contact-displayname detail-dialog">
                  {props.searchResult.displayName}
                </p>
                <DialogTrigger>
                  <div className="tile__detailed-view__dismiss">
                    <Dismiss24Regular />
                  </div>
                </DialogTrigger>
              </div>
              <hr className="tile__hr tile--large detail-dialog__header-hr" />
              <div className="tile__contact-metadata-container detail-dialog">
                <div className="tile__contact-metadata detail-dialog">
                  <div className="tile__detail-dialog__contact-metadata-item">
                    <BuildingSkyscraper24Regular className="tile__detail-dialog__metadata-icons" />
                    <span> {props.searchResult.companyName ?? "-"}</span>
                  </div>
                  <div className="tile__detail-dialog__contact-metadata-item">
                    <PeopleCommunity24Regular className="tile__detail-dialog__metadata-icons" />
                    <span>{props.searchResult.department ?? "-"}</span>
                  </div>
                  <div className="tile__detail-dialog__contact-metadata-item">
                    <Person24Regular className="tile__detail-dialog__metadata-icons" />
                    <span>{props.searchResult.jobTitle ?? "-"}</span>
                  </div>
                  <div className="tile__detail-dialog__contact-metadata-item">
                    <Location24Regular className="tile__detail-dialog__metadata-icons" />
                    <span>
                      {addressArray[0].IsNullOrEmpty() === false
                        ? addressArray[0]
                        : "-"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <hr className="tile__hr tile--large detail-dialog" />
            <div className="tile__contact-info-container">
              <p className="tile__detail-dialog__contacts">
                {localizedStrings.contacts}
              </p>
              <div className="tile__contact-info detail-dialog">
                <Phone24Regular className="tile__contact-info__info-type-icon" />
                <TileContactInfo
                  intputArray={phoneMobileArray}
                  copyToClipBoard={copyToClipBoard}
                />
              </div>
              <div className="tile__contact-info detail-dialog">
                <Building24Regular className="tile__contact-info__info-type-icon" />
                <TileContactInfo
                  intputArray={phoneBusinessArray}
                  copyToClipBoard={copyToClipBoard}
                />
              </div>
              <div className="tile__contact-info detail-dialog">
                <Mention24Regular className="tile__contact-info__info-type-icon" />
                <TileContactInfo
                  intputArray={emailArray}
                  copyToClipBoard={copyToClipBoard}
                />
              </div>
            </div>
            <div className="source-icon tile__detailed-view">
              <span className="tile__detailed-view__source-text">
                {localizedStrings.foundIn.replace("({source})", sourceName)}
              </span>
              <div className="tile__detailed-view__source-icon">
                <SourceIcon sourceType={props.searchResult.source} />
              </div>
            </div>

            <div className="tile__detailed-view__actions">
              <hr className="hrAction" />
              <TileButtonAction
                imEmailArray={imEmailArray}
                emailArray={emailArray}
                phoneArray={phoneArray}
                isCurrentUser={isCurrentUser}
                messageButtonId={messageButtonId}
                emailButtonId={emailButtonId}
                phoneButtonId={phoneButtonId}
                videoButtonId={videoButtonId}
              />
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
