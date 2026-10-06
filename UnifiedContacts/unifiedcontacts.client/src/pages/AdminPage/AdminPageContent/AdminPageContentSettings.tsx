import {
  ChangeEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import Form from "react-bootstrap/esm/Form";
import Spinner from "react-bootstrap/esm/Spinner";
import ListGroup from "react-bootstrap/ListGroup";
import {
  postAdminControllerCreateEntraIdFilter,
  getAdminControllerGetAllSettingValuesOfCategory,
  getAdminControllerGetSettingsValue,
  postAdminControllerSetAllSettingValuesOfCategory,
  putAdminControllerSetEntraIdFilterSettings,
  postAdminControllerSetSettingsValue,
  deleteAdminControllerDeleteEntraIdFilter,
} from "../../../services/ApiService";
import {
  HashTable,
  Loadable,
  TEntraIdFilter,
  TEntraIdFilterState,
} from "../../../types/Types";
import Button from "react-bootstrap/esm/Button";
import { Trash, XLg, CheckLg } from "react-bootstrap-icons";
import Overlay from "react-bootstrap/esm/Overlay";
import Tooltip from "react-bootstrap/esm/Tooltip";

const diagnosticOptionsCodeToStringDict: HashTable<string> = {
  "0": "Off",
  "1": "Anonymous",
  "2": "General",
  "4": "Detailed",
};

const diagnosticOptionsStringToCodeDict: HashTable<string> = {
  Off: "0",
  Anonymous: "1",
  General: "2",
  Detailed: "4",
};

type TSourceDefinitionState = {
  id: string;
  displayName: string;
  enabled: boolean;
  order: number;
};
type TSbcLookupSettingsState = {
  endpointEnabled: boolean;
  anyNodeEndpointEnabled: boolean;
  ipAuthenticationEnabled: boolean;
  allowedIpAddresses: string[];
  credentialsLastModifiedBy?: string;
  credentialsLastModified?: string;
};
type TSbcValidationsState = {
  userNameInvalid: boolean;
  passwordInvalid: boolean;
  userNameInvalidMessage: string;
  passwordInvalidMessage: string;
};
type TIpAddressInputValidationState = {
  isInvalid: boolean;
  invalidMessage: string;
};

const enabledSourcesDetails: HashTable<{ displayName: string; order: number }> =
  {
    azuread: { displayName: "Entra Id", order: 1 },
    usercontacts: { displayName: "User Contacts", order: 2 },
    orgcontacts: { displayName: "Org Contacts", order: 3 },
    sharepoint: { displayName: "SharePoint", order: 4 },
    database: { displayName: "Database", order: 5 },
  };

const ENTRAID_FILTER_LIMIT: number = 5;
export function AdminPageContentSettings() {
  const applySbcEndpointCredentialsButton = useRef(null);

  const [selectedDiagnosticLevel, setSelectedDiagnosticLevel] =
    useState<string>();
  const [enabledSources, setEnabledSources] = useState<
    Loadable<TSourceDefinitionState[]>
  >({
    loading: true,
  });
  const [sbcSettings, setSbcSettings] = useState<
    Loadable<TSbcLookupSettingsState>
  >({
    loading: true,
  });
  const [entraIdFilter, setEntraIdFilter] = useState<
    Loadable<TEntraIdFilterState>
  >({
    loading: true,
  });
  const [sbcCredentialValidations, setSbcCredentialValidations] =
    useState<TSbcValidationsState>({
      userNameInvalid: false,
      passwordInvalid: false,
      userNameInvalidMessage: "",
      passwordInvalidMessage: "",
    });
  const [tempSbcIpAddressInput, setTempSbcIpAddressInput] =
    useState<string>("");
  const [tempSbcIpAddressInputValidation, setTempSbcIpAddressInputValidation] =
    useState<TIpAddressInputValidationState>({
      isInvalid: false,
      invalidMessage: "",
    });

  const initialEntraIdFilterState: TEntraIdFilter = {
    filterAttribute: "",
    condition: "",
    filterValue: "",
  };

  const [tempEntraIdFilter, setTempEntraIdFilter] = useState<TEntraIdFilter>(
    initialEntraIdFilterState
  );

  const [sbcEndpointUsername, setSbcEndpointUsername] = useState<string>("");
  const [sbcEndpointPassword, setSbcEndpointPassword] = useState<string>("");
  const [sbcEndpointCredentialSuccess, setSbcEndpointCredentialSuccess] =
    useState<boolean>(false);
  const [sbcEndpointCredentialLoading, setSbcEndpointCredentialLoading] =
    useState<boolean>(false);

  const initSbcSettings = (): void => {
    getAdminControllerGetAllSettingValuesOfCategory("sbcLookup").then(
      (response) => {
        if (response) {
          let allowedIpAddresses: string[] = [];
          const allowedIpAddressesString = response.settings.find(
            (setting) => setting.settingId === "allowedIpAddresses"
          )?.value;
          if (allowedIpAddressesString) {
            allowedIpAddresses = allowedIpAddressesString.split(";");
          }

          const sbcSettings: TSbcLookupSettingsState = {
            endpointEnabled:
              response.settings.find(
                (setting) => setting.settingId === "endpointEnabled"
              )?.value === "1",
            anyNodeEndpointEnabled:
              response.settings.find(
                (setting) => setting.settingId === "anyNodeEndpointEnabled"
              )?.value === "1",
            ipAuthenticationEnabled:
              response.settings.find(
                (setting) => setting.settingId === "ipAuthenticationEnabled"
              )?.value === "1",
            allowedIpAddresses: allowedIpAddresses,
            credentialsLastModifiedBy: response.settings.find(
              (setting) =>
                setting.settingId === "endpointCredentialsLastModifiedBy"
            )?.value,
            credentialsLastModified: response.settings.find(
              (setting) =>
                setting.settingId === "endpointCredentialsLastModified"
            )?.value,
          };
          setSbcSettings({
            loading: false,
            data: sbcSettings,
          });
        } else {
          setSbcSettings({
            loading: false,
            data: {
              endpointEnabled: false,
              anyNodeEndpointEnabled: false,
              ipAuthenticationEnabled: false,
              allowedIpAddresses: [],
            },
          });
        }
      }
    );
  };

  const initEnabledSources = (): void => {
    getAdminControllerGetAllSettingValuesOfCategory("enabledSources").then(
      (response) => {
        if (response) {
          const enabledSources: TSourceDefinitionState[] = [];
          response.settings.forEach((setting) => {
            enabledSources.push({
              id: setting.settingId,
              displayName:
                enabledSourcesDetails[setting.settingId].displayName ??
                setting.settingId,
              enabled: setting.value === "1",
              order: enabledSourcesDetails[setting.settingId].order ?? 9999,
            });
          });
          setEnabledSources({
            loading: false,
            data: enabledSources.sort((a, b) => a.order - b.order),
          });
        } else {
          setEnabledSources({
            loading: false,
            data: [],
          });
        }
      }
    );
  };
  const initEntraIdFilter = (): void => {
    getAdminControllerGetAllSettingValuesOfCategory("filterAttributes").then(
      (response) => {
        if (response) {
          let filterAttributes: TEntraIdFilter[] = [];
          const entraIdFilterValue = response.settings.find(
            (setting) => setting.settingId === "entraIdFilters"
          )?.value;
          if (entraIdFilterValue) {
            filterAttributes = JSON.parse(entraIdFilterValue);
          }
          const entraIdFilter: TEntraIdFilterState = {
            entraIdFilters: filterAttributes,
          };
          setEntraIdFilter({
            loading: false,
            data: entraIdFilter,
          });
        } else {
          setEntraIdFilter({
            loading: false,
            data: {
              entraIdFilters: [],
            },
          });
        }
      }
    );
  };
  const clearFilterInput = (): void => {
    setTempEntraIdFilter(initialEntraIdFilterState);
  };

  useEffect(() => {
    getAdminControllerGetSettingsValue("telemetry", "errorTelemetryLevel").then(
      (setting) => {
        if (setting.value) {
          setSelectedDiagnosticLevel(
            diagnosticOptionsCodeToStringDict[setting.value] ?? ""
          );
        } else {
          setSelectedDiagnosticLevel("");
        }
      }
    );

    initSbcSettings();
    initEnabledSources();
    initEntraIdFilter();
  }, []);

  // SBC Credentials validation
  const validateUsername = (username: string) => {
    let isValid = true;
    let invalidMessage = "";

    if (username && username.length < 3) {
      isValid = false;
      invalidMessage += "Username must be at least 3 characters long. ";
    }

    const notAllowedCharactersRegex = /[^a-zA-Z0-9]+/g;
    if (username && username.match(notAllowedCharactersRegex) !== null) {
      isValid = false;
      invalidMessage +=
        "Username contains invalid characters. Only alphanumeric characters are allowed. ";
    }

    setSbcCredentialValidations((prev) => ({
      ...prev,
      userNameInvalid: !isValid,
      userNameInvalidMessage: invalidMessage,
    }));
  };

  const validatePassword = (password: string) => {
    let isValid = true;
    let invalidMessage = "";

    if (password && password.length < 16) {
      isValid = false;
      invalidMessage += "Password must be at least 16 characters long. ";
    }

    const containsSpecialCharacterRegex = /[!?@#$%^&*()_+\-=[\]{}]+/g;
    if (password && password.match(containsSpecialCharacterRegex) === null) {
      isValid = false;
      invalidMessage +=
        "Password must contain at least one special character (!?@#$%^&*()_+-=[]{}). ";
    }

    const notAllowedCharactersRegex = /[^a-zA-Z0-9!?@#$%^&*()_+\-=[\]{}]+/g;
    if (password && password.match(notAllowedCharactersRegex) !== null) {
      isValid = false;
      invalidMessage +=
        "Password contains invalid characters. Valid characters are alphanumeric and !?@#$%^&*()_+-=[]{}. ";
    }

    setSbcCredentialValidations((prev) => ({
      ...prev,
      passwordInvalid: !isValid,
      passwordInvalidMessage: invalidMessage,
    }));
  };

  // SBC IP Address validation
  const validateIpAddress = (ipAddress: string) => {
    const ipAddressValidationRegex =
      /^((?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))|((([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])))$/g;
    if (ipAddress && ipAddress.match(ipAddressValidationRegex) === null) {
      setTempSbcIpAddressInputValidation({
        isInvalid: true,
        invalidMessage: "Please enter a valid IPv4 or IPv6 address.",
      });
    } else {
      setTempSbcIpAddressInputValidation({
        isInvalid: false,
        invalidMessage: "",
      });
    }
  };

  //SBC lookup endpoint settings functions
  const applySbcCredentials = (): void => {
    setSbcEndpointCredentialSuccess(false);
    setSbcEndpointCredentialLoading(true);
    postAdminControllerSetSettingsValue(
      "sbcLookup",
      "endpointCredentials",
      `${sbcEndpointUsername}:${sbcEndpointPassword}`,
      true
    )
      .then(() => {
        setSbcEndpointCredentialSuccess(true);
        setTimeout(() => {
          setSbcEndpointCredentialSuccess(false);
        }, 3000);
      })
      .finally(() => {
        setSbcEndpointCredentialLoading(false);
        initSbcSettings();
      });
  };

  const saveCurrentSbcSettingsExcludingCredentials = (
    state?: TSbcLookupSettingsState
  ): void => {
    console.log(state?.allowedIpAddresses);
    postAdminControllerSetAllSettingValuesOfCategory(
      "sbcLookup",
      [
        {
          settingId: "endpointEnabled",
          value: state?.endpointEnabled ? "1" : "0",
        },
        {
          settingId: "anyNodeEndpointEnabled",
          value: state?.anyNodeEndpointEnabled ? "1" : "0",
        },
        {
          settingId: "ipAuthenticationEnabled",
          value: state?.ipAuthenticationEnabled ? "1" : "0",
        },
        {
          settingId: "allowedIpAddresses",
          value: state?.allowedIpAddresses.join(";"),
        },
      ],
      true
    ).catch((error) => {
      console.error("Error while saving SBC settings", error);
      initSbcSettings();
    });
  };

  const addIpAddress = (): void => {
    const newData: TSbcLookupSettingsState | undefined = sbcSettings.data;
    newData?.allowedIpAddresses.push(tempSbcIpAddressInput);
    setSbcSettings((prev) => {
      return {
        ...prev,
        data: newData,
      };
    });
    setTempSbcIpAddressInput("");
    saveCurrentSbcSettingsExcludingCredentials(newData);
  };

  const addEntraIdFilter = (): void => {
    postAdminControllerCreateEntraIdFilter({
      filterAttribute: tempEntraIdFilter.filterAttribute,
      condition: tempEntraIdFilter.condition,
      filterValue: tempEntraIdFilter.filterValue,
    }).then(() => {
      initEntraIdFilter();
      clearFilterInput();
    });
  };

  const removeEntraIdFilter = (filterToRemove: TEntraIdFilter): void => {
    if (filterToRemove.id) {
      deleteAdminControllerDeleteEntraIdFilter(filterToRemove?.id).then(() => {
        initEntraIdFilter();
        clearFilterInput();
      });
    }
  };

  const removeIpAddress = (ipAddressToRemove: string): void => {
    const newData: TSbcLookupSettingsState | undefined = sbcSettings.data && {
      ...sbcSettings.data,
      allowedIpAddresses: sbcSettings.data.allowedIpAddresses.filter(
        (ip) => ip !== ipAddressToRemove
      ),
    };
    setSbcSettings((prev) => {
      return {
        ...prev,
        data: newData,
      };
    });
    saveCurrentSbcSettingsExcludingCredentials(newData);
  };

  const onToggleEnableSbcLookupEndpoint = (enabled: boolean): void => {
    const newData: TSbcLookupSettingsState | undefined = sbcSettings.data && {
      ...sbcSettings.data,
      endpointEnabled: enabled,
    };
    setSbcSettings((prev) => {
      return {
        ...prev,
        data: newData,
      };
    });
    saveCurrentSbcSettingsExcludingCredentials(newData);
  };

  const onToggleEnableSbcLookupAnyNodeEndpoint = (enabled: boolean): void => {
    const newData: TSbcLookupSettingsState | undefined = sbcSettings.data && {
      ...sbcSettings.data,
      anyNodeEndpointEnabled: enabled,
    };
    setSbcSettings((prev) => {
      return {
        ...prev,
        data: newData,
      };
    });
    saveCurrentSbcSettingsExcludingCredentials(newData);
  };

  const onToggleEnableIpAuthentication = (enabled: boolean): void => {
    const newData: TSbcLookupSettingsState | undefined = sbcSettings.data && {
      ...sbcSettings.data,
      ipAuthenticationEnabled: enabled,
    };
    setSbcSettings((prev) => {
      return {
        ...prev,
        data: newData,
      };
    });
    saveCurrentSbcSettingsExcludingCredentials(newData);
  };

  //Enable source functions
  const changeStateOfSingleEnabledSource = (
    sourceId: string,
    enabled: boolean
  ) => {
    const newEnabledSources = enabledSources.data
      ? [...enabledSources.data]
      : []; //deep copy
    const element = newEnabledSources.find((src) => src.id === sourceId);
    if (element) {
      element.enabled = enabled;
    }
    setEnabledSources({ loading: false, data: newEnabledSources });
  };

  const onToggleEnabledSource = (sourceId: string, enabled: boolean): void => {
    changeStateOfSingleEnabledSource(sourceId, enabled);
    postAdminControllerSetSettingsValue(
      "enabledSources",
      sourceId,
      enabled ? "1" : "0",
      true
    ).catch(() => {
      // revert state if error
      getAdminControllerGetSettingsValue("enabledSources", sourceId)
        .then((response) => {
          changeStateOfSingleEnabledSource(sourceId, response.value === "1");
        })
        .catch((error) => {
          console.error(
            `Error while toggling enable source of ${sourceId}`,
            error
          );
          changeStateOfSingleEnabledSource(sourceId, !enabled);
        });
    });
  };
  const updateEntraIdFilter = (filter: TEntraIdFilter): void => {
    putAdminControllerSetEntraIdFilterSettings(filter.id ?? "", filter).then(
      () => {
        initEntraIdFilter();
      }
    );
  };

  const editFilterAttribute = (
    filter: TEntraIdFilter,
    attribute: string
  ): void => {
    const newData: TEntraIdFilterState | undefined = entraIdFilter.data;
    if (newData) {
      const filterToEdit = newData.entraIdFilters.find(
        (entraIdFilter) => entraIdFilter == filter
      );
      if (filterToEdit) {
        filterToEdit.filterAttribute = attribute;
        filterToEdit.isValid = undefined;
        filterToEdit.validationMessage = "";
      }
    }
    setEntraIdFilter((prev) => {
      return {
        ...prev,
        data: newData,
      };
    });
  };
  const editFilterCondition = (
    filter: TEntraIdFilter,
    condition: string
  ): void => {
    const newData: TEntraIdFilterState | undefined = entraIdFilter.data;
    if (newData) {
      const filterToEdit = newData.entraIdFilters.find(
        (entraIdFilter) => entraIdFilter == filter
      );
      if (filterToEdit) {
        filterToEdit.condition = condition;
        filterToEdit.isValid = undefined;
        filterToEdit.validationMessage = "";
      }
    }
    setEntraIdFilter((prev) => {
      return {
        ...prev,
        data: newData,
      };
    });
  };
  const editFilterValue = (filter: TEntraIdFilter, value: string): void => {
    const newData: TEntraIdFilterState | undefined = entraIdFilter.data;
    if (newData) {
      const filterToEdit = newData.entraIdFilters.find(
        (entraIdFilter) => entraIdFilter == filter
      );
      if (filterToEdit) {
        filterToEdit.filterValue = value;
        filterToEdit.isValid = undefined;
        filterToEdit.validationMessage = "";
      }
    }
    setEntraIdFilter((prev) => {
      return {
        ...prev,
        data: newData,
      };
    });
  };
  const filterChoice = (): ReactNode => {
    return (
      <>
        <option value="">Open this select menu</option>
        <option value="{2} eq '{1}'">Equal</option>
        <option value="{2} ne '{1}'">Not Equal</option>
        <option value="startswith({2},'{1}')">StartsWith</option>
        <option value="not(startswith({2},'{1}'))">Not StartsWith</option>
        <option value="endswith({2},'{1}')">EndsWith</option>
        <option value="not(endswith({2},'{1}'))">Not EndsWith</option>
        <option value="contains({2},'{1}')">Contains</option>
        <option value="not(contains({2},'{1}'))">Not Contains</option>
      </>
    );
  };

  const buildFilterlists = (item: TEntraIdFilter): ReactNode => {
    return (
      <>
        <Form.Group key={item.id}>
          <div className="admin-page__settings__ip-address">
            <div
              className="flex-container flex-container--dont-grow"
              style={{ marginBottom: "0.125rem" }}
            >
              <Button
                className="admin-page__entraid-filters__small-buttons"
                onClick={() => removeEntraIdFilter(item)}
              >
                <Trash />
              </Button>
              <div className="full-width admin-page__entraid-filters__flex-container">
                <Form.Control
                  type="text"
                  placeholder="Filter Attribute"
                  className="admin-page__entraid-filters__inputfields"
                  value={item.filterAttribute}
                  onChange={(
                    val: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
                  ) => {
                    const attributeInput: string = val.target.value;
                    editFilterAttribute(item, attributeInput);
                  }}
                />
                <Form.Select
                  name="Filter Condition"
                  value={item.condition}
                  className="admin-page__entraid-filters__inputfields"
                  onChange={(val: ChangeEvent<HTMLSelectElement>) => {
                    const conditionInput: string = val.target.value;
                    editFilterCondition(item, conditionInput);
                  }}
                >
                  {filterChoice()}
                </Form.Select>
                <Form.Control
                  type="text"
                  placeholder="Filter Value"
                  className="admin-page__entraid-filters__inputfields"
                  value={item.filterValue}
                  onChange={(
                    val: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
                  ) => {
                    const valueInput: string = val.target.value;
                    editFilterValue(item, valueInput);
                  }}
                />
                <Button
                  onClick={() => updateEntraIdFilter(item)}
                  className="admin-page__entraid-filters__large-buttons"
                  style={
                    item.isValid !== undefined
                      ? item.isValid
                        ? { backgroundColor: "green", borderColor: "green" }
                        : { backgroundColor: "red", borderColor: "red" }
                      : {}
                  }
                  disabled={
                    item.isValid !== undefined && !item.validationRunning
                  }
                >
                  {item.validationRunning ? (
                    <div>
                      <Spinner className="admin-page__entraid-filters__spinner" />
                    </div>
                  ) : item.isValid ? (
                    <CheckLg />
                  ) : item.isValid === undefined ? (
                    "update"
                  ) : (
                    <XLg />
                  )}
                </Button>
              </div>
            </div>
            <div style={item.isValid ? { color: "green" } : { color: "red" }}>
              {item.validationMessage}
            </div>
          </div>
        </Form.Group>
      </>
    );
  };
  return (
    <>
      <h1>Settings</h1>
      <Form
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <Form.Group className="mb-3" controlId="diagnostics">
          <Form.Label>
            <h5>Diagnostics Error Log level</h5>
          </Form.Label>
          {selectedDiagnosticLevel ? (
            <Form.Select
              onChange={(event) => {
                setSelectedDiagnosticLevel(event.target.value);
                postAdminControllerSetSettingsValue(
                  "telemetry",
                  "errorTelemetryLevel",
                  diagnosticOptionsStringToCodeDict[event.target.value]
                );
              }}
              value={selectedDiagnosticLevel}
            >
              <option key="0">Off</option>
              <option key="1">Anonymous</option>
              <option key="2">General</option>
              <option key="3">Detailed</option>
            </Form.Select>
          ) : (
            <div>
              <Spinner />
            </div>
          )}
          <Form.Text className="text-muted">
            Select your desired error log level which will be called back to the
            manufacturer. For more information click{" "}
            <a
              href="https://docs.unified-contacts.com/advanced-configuration/logs-and-telemetry"
              target="_blank"
              rel="noopener noreferrer"
            >
              here
            </a>
            .
          </Form.Text>
        </Form.Group>
        <hr />
        <Form.Group className="mb-3" controlId="diagnostics">
          <Form.Label>
            <h5>Enabled Sources</h5>
          </Form.Label>
          {enabledSources.loading ? (
            <div>
              <Spinner />
            </div>
          ) : (
            enabledSources.data?.map((source) => {
              return (
                <Form.Check
                  className="bootstrap__form-check--cursor-pointer"
                  type="switch"
                  key={source.id}
                  id={source.id}
                  label={source.displayName}
                  checked={source.enabled}
                  onChange={(event) => {
                    onToggleEnabledSource(source.id, event.target.checked);
                  }}
                />
              );
            })
          )}
          <Form.Text className="text-muted">
            Select the sources that your users should be able to search through.
            Changes are saved and applied automatically.
          </Form.Text>
        </Form.Group>
        <hr />
        <Form.Group className="mb-3" controlId="diagnostics">
          <Form.Label>
            <h5>Entra ID Filter</h5>
          </Form.Label>
          {entraIdFilter.loading ? (
            <div>
              <Spinner />
            </div>
          ) : (
            <>
              <Form.Group>
                <div className="admin-page__settings__ip-address">
                  {(entraIdFilter?.data?.entraIdFilters?.length ?? 0) <=
                    ENTRAID_FILTER_LIMIT - 1 && (
                    <div
                      className="flex-container flex-container--dont-grow"
                      style={{ marginBottom: "0.125rem" }}
                    >
                      <Button
                        className="admin-page__entraid-filters__small-buttons"
                        onClick={addEntraIdFilter}
                        disabled={
                          tempEntraIdFilter.filterAttribute === "" ||
                          tempEntraIdFilter.condition === "" ||
                          tempEntraIdFilter.filterValue === "" ||
                          (entraIdFilter?.data?.entraIdFilters?.length ?? 0) >=
                            ENTRAID_FILTER_LIMIT
                        }
                      >
                        +
                      </Button>
                      <div className="full-width admin-page__entraid-filters__flex-container">
                        <Form.Control
                          type="text"
                          placeholder="Filter Attribute"
                          className="admin-page__entraid-filters__inputfields"
                          value={tempEntraIdFilter.filterAttribute}
                          onChange={(
                            val: ChangeEvent<
                              HTMLInputElement | HTMLTextAreaElement
                            >
                          ) => {
                            const attributeInput: string = val.target.value;
                            setTempEntraIdFilter({
                              filterAttribute: attributeInput,
                              condition: tempEntraIdFilter.condition,
                              filterValue: tempEntraIdFilter.filterValue,
                            });
                          }}
                        />
                        <Form.Select
                          name="Filter Condition"
                          value={tempEntraIdFilter.condition}
                          className="admin-page__entraid-filters__inputfields"
                          onChange={(val: ChangeEvent<HTMLSelectElement>) => {
                            const conditionInput: string = val.target.value;
                            setTempEntraIdFilter({
                              filterAttribute:
                                tempEntraIdFilter.filterAttribute,
                              condition: conditionInput,
                              filterValue: tempEntraIdFilter.filterValue,
                            });
                          }}
                        >
                          {filterChoice()}
                        </Form.Select>
                        <Form.Control
                          type="text"
                          placeholder="Filter Value"
                          className="admin-page__entraid-filters__inputfields"
                          value={tempEntraIdFilter.filterValue}
                          onChange={(
                            val: ChangeEvent<
                              HTMLInputElement | HTMLTextAreaElement
                            >
                          ) => {
                            const valueInput: string = val.target.value;
                            setTempEntraIdFilter({
                              filterAttribute:
                                tempEntraIdFilter.filterAttribute,
                              condition: tempEntraIdFilter.condition,
                              filterValue: valueInput,
                            });
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {entraIdFilter.data?.entraIdFilters.map((item) => {
                    return buildFilterlists(item);
                  })}
                </div>
                <Form.Text className="text-muted">
                  Only contacts that match the filters are found in Unified
                  Contacts. Only validated filters are active. The maximum
                  allowed number of filters is {ENTRAID_FILTER_LIMIT}. For more
                  information click{" "}
                  <a
                    href="https://aka.c4a8.net/ucentraidfilter"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    here
                  </a>
                  .
                </Form.Text>
              </Form.Group>
            </>
          )}
        </Form.Group>
        <hr />

        <Form.Group className="mb-3" controlId="diagnostics">
          <Form.Label>
            <h5>SBC Lookup</h5>
          </Form.Label>
          {sbcSettings.loading ? (
            <div>
              <Spinner />
            </div>
          ) : (
            <>
              <Form.Group>
                <Form.Check
                  type="switch"
                  label="AudioCodes Endpoint (Generic Endpoint)"
                  className="bootstrap__form-check--cursor-pointer"
                  checked={sbcSettings.data?.endpointEnabled ?? false}
                  style={{ cursor: "pointer" }}
                  onChange={(event) => {
                    onToggleEnableSbcLookupEndpoint(event.target.checked);
                  }}
                />
                <Form.Check
                  type="switch"
                  label="AnyNode Endpoint"
                  className="bootstrap__form-check--cursor-pointer"
                  checked={sbcSettings.data?.anyNodeEndpointEnabled ?? false}
                  style={{ cursor: "pointer" }}
                  onChange={(event) => {
                    onToggleEnableSbcLookupAnyNodeEndpoint(
                      event.target.checked
                    );
                  }}
                />
              </Form.Group>
              {(sbcSettings.data?.endpointEnabled ||
                sbcSettings.data?.anyNodeEndpointEnabled) && (
                <>
                  <Form.Group>
                    <Form.Check
                      type="switch"
                      label="IP Authentication"
                      className="bootstrap__form-check--cursor-pointer"
                      checked={
                        sbcSettings.data?.ipAuthenticationEnabled ?? false
                      }
                      style={{ cursor: "pointer" }}
                      onChange={(event) => {
                        onToggleEnableIpAuthentication(event.target.checked);
                      }}
                    />
                    {sbcSettings.data?.ipAuthenticationEnabled && (
                      <div className="admin-page__settings__ip-address">
                        <div
                          className="flex-container flex-container--dont-grow"
                          style={{ marginBottom: "0.125rem" }}
                        >
                          <Button
                            disabled={
                              tempSbcIpAddressInputValidation.isInvalid ||
                              !tempSbcIpAddressInput
                            }
                            onClick={addIpAddress}
                          >
                            +
                          </Button>
                          <div className="full-width">
                            <Form.Control
                              type="text"
                              placeholder="IP address"
                              value={tempSbcIpAddressInput}
                              onChange={(
                                val: ChangeEvent<
                                  HTMLInputElement | HTMLTextAreaElement
                                >
                              ) => {
                                setTempSbcIpAddressInput(val.target.value);
                                validateIpAddress(val.target.value);
                              }}
                              isInvalid={
                                tempSbcIpAddressInputValidation.isInvalid
                              }
                            />
                            <Form.Control.Feedback type="invalid">
                              {tempSbcIpAddressInputValidation.invalidMessage}
                            </Form.Control.Feedback>
                          </div>
                        </div>
                        <ListGroup>
                          {sbcSettings.data?.allowedIpAddresses.map((ip) => {
                            return (
                              <div key={ip} className="flex-container">
                                <ListGroup.Item className="full-width">
                                  {ip}
                                </ListGroup.Item>
                                <div
                                  onClick={() => {
                                    removeIpAddress(ip);
                                  }}
                                  className="admin-page__settings__ip-address__remove-action"
                                >
                                  <Trash />
                                </div>
                              </div>
                            );
                          })}
                        </ListGroup>
                      </div>
                    )}
                    <Form.Text className="text-muted">
                      Changes to IP Authentication and Endpoint enablement are
                      saved and applied automatically.
                    </Form.Text>
                  </Form.Group>
                  <Form.Group>
                    <Form.Label>Basic Auth Credentials</Form.Label>
                    {sbcSettings.data?.credentialsLastModified && (
                      <div>
                        <Form.Text className="text-muted">
                          Last modified by{" "}
                          {sbcSettings.data?.credentialsLastModifiedBy ??
                            "UNKNOWN"}{" "}
                          at {sbcSettings.data?.credentialsLastModified}
                        </Form.Text>
                      </div>
                    )}
                    <div className="flex-container flex-container--dont-grow">
                      <div className="full-width">
                        <Form.Control
                          type="text"
                          placeholder="Username"
                          value={sbcEndpointUsername}
                          onChange={(
                            val: ChangeEvent<
                              HTMLInputElement | HTMLTextAreaElement
                            >
                          ) => {
                            setSbcEndpointUsername(val.target.value);
                            validateUsername(val.target.value);
                          }}
                          isInvalid={sbcCredentialValidations.userNameInvalid}
                        />
                        <Form.Control.Feedback type="invalid">
                          {sbcCredentialValidations.userNameInvalidMessage}
                        </Form.Control.Feedback>
                      </div>
                      <div className="full-width">
                        <Form.Control
                          type="password"
                          placeholder="Password"
                          value={sbcEndpointPassword}
                          onChange={(
                            val: ChangeEvent<
                              HTMLInputElement | HTMLTextAreaElement
                            >
                          ) => {
                            setSbcEndpointPassword(val.target.value);
                            validatePassword(val.target.value);
                          }}
                          isInvalid={sbcCredentialValidations.passwordInvalid}
                        />
                        <Form.Control.Feedback type="invalid">
                          {sbcCredentialValidations.passwordInvalidMessage}
                        </Form.Control.Feedback>
                      </div>
                      <Button
                        variant="primary"
                        onClick={applySbcCredentials}
                        ref={applySbcEndpointCredentialsButton}
                        disabled={
                          !sbcEndpointUsername ||
                          !sbcEndpointPassword ||
                          sbcCredentialValidations.userNameInvalid ||
                          sbcCredentialValidations.passwordInvalid ||
                          sbcEndpointCredentialLoading
                        }
                        style={{ width: "10rem" }}
                      >
                        {sbcEndpointCredentialLoading ? (
                          <Spinner size="sm" />
                        ) : (
                          "Apply"
                        )}
                      </Button>
                      <Overlay
                        target={applySbcEndpointCredentialsButton}
                        show={sbcEndpointCredentialSuccess}
                        placement="left"
                      >
                        <Tooltip>Success!</Tooltip>
                      </Overlay>
                    </div>
                    <Form.Text className="text-muted">
                      NOTE: Once you leave this page you will not be able to see
                      the user name or the password. If you have forgotten the
                      credentials you have to re apply new ones.
                    </Form.Text>
                  </Form.Group>
                </>
              )}
            </>
          )}
        </Form.Group>
      </Form>
    </>
  );
}
