import {
  MenuItem,
  MenuList,
  Menu,
  MenuTrigger,
  MenuPopover,
  Button,
} from "@fluentui/react-components";
import {
  Copy24Regular,
  ChevronDown24Regular,
  ChevronUp24Regular,
} from "@fluentui/react-icons";
import { useState } from "react";

export type ContactInfoCopyProps = {
  intputArray: string[];
  copyToClipBoard(value: string): void;
};

const TileContactInfoMenuList = (props: ContactInfoCopyProps) => {
  const [dropDownIconDown, setDropDownIconDown] = useState(true);
  const setDropDownDirection = () => {
    setDropDownIconDown(!dropDownIconDown);
  };
  const dropDownIcon = dropDownIconDown ? (
    <ChevronDown24Regular className="tile-contact-info__dropdown-icon" />
  ) : (
    <ChevronUp24Regular className="tile-contact-info__dropdown-icon" />
  );
  return (
    <Menu onOpenChange={setDropDownDirection}>
      <MenuTrigger>
        <div
          className="tile-contact-info__dropdown-trigger"
          onClick={setDropDownDirection}
        >
          <span className="tile-contact-info__dropdown-trigger-info-field">{props.intputArray[0]}</span>
          <Button
            className="tile-contact-info__dropdown-icon"
            appearance="transparent"
            icon={dropDownIcon}
          />
        </div>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {props.intputArray.map((item) => (
            <MenuItem key={item}>
              <div style={{ display: "flex" }}>
                <p style={{ marginRight: "5px" }}>{item}</p>
                <Button
                  className="copy-icon"
                  appearance="transparent"
                  icon={<Copy24Regular />}
                  onClick={() => props.copyToClipBoard(item)}
                />
              </div>
            </MenuItem>
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
};

const TileContactInfo = (props: ContactInfoCopyProps) => {
  return (
    <>
      {props.intputArray.length > 1 && (
        <TileContactInfoMenuList
          intputArray={props.intputArray}
          copyToClipBoard={props.copyToClipBoard}
        />
      )}
      {props.intputArray.length <= 1 && (
        <div className="contact-info-copy__container">
          {props.intputArray.length === 1 && (
            <>
              <p>{props.intputArray[0]}</p>
              <Button
                className="copy-icon"
                appearance="transparent"
                icon={<Copy24Regular />}
                onClick={() => props.copyToClipBoard(props.intputArray[0])}
              />
            </>
          )}
          {props.intputArray.length === 0 && <p>-</p>}
        </div>
      )}
    </>
  );
};

export default TileContactInfo;
