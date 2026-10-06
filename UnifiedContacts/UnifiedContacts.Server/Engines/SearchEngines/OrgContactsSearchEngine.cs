using Microsoft.Graph;
using Microsoft.Graph.Models;
using Microsoft.Kiota.Abstractions;
using System.Security.Claims;
using System.Text.Json;
using UnifiedContacts.Interfaces;
using UnifiedContacts.Models;
using UnifiedContacts.Models.Dto;
using UnifiedContacts.Settings;

namespace UnifiedContacts.Engines.SearchEngines
{
    public class OrgContactsSearchEngine : ISearchEngine
    {
        private readonly IGraphApiEngine _graphApiEngine;
        private readonly AuthSettings _authSettings;

        private const string SEARCH_QUERY_PLACEHOLDER = "{{{SEARCH_QUERY_PLACEHOLDER}}}";
        private const string ORG_CONTACTS_GRAPH_FILTER_TEMPLATE = $"startswith(displayName, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(givenName, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(surname, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(department, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(jobTitle, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(mail, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(companyName, '{SEARCH_QUERY_PLACEHOLDER}')";

        public OrgContactsSearchEngine(IGraphApiEngine graphApiEngine, AuthSettings authSettings)
        {
            _graphApiEngine = graphApiEngine;
            _authSettings = authSettings;
        }

        private List<SearchEngineResultDto> ConvertToSearchEnginerResults(IEnumerable<OrgContact> orgContacts)
        {
            List<SearchEngineResultDto> returnDtos = new List<SearchEngineResultDto>();
            foreach (OrgContact orgContact in orgContacts)
            {
                string? orgContactDisplayName = orgContact.DisplayName;
                if (string.IsNullOrWhiteSpace(orgContactDisplayName))
                {
                    orgContactDisplayName = $"{orgContact.GivenName} {orgContact.Surname}";
                }
                SearchEngineResultDto searchResult = new SearchEngineResultDto($"{UnifiedContactStaticStrings.CONTACT_ID_PREFIX_ORG_CONTACT}_{orgContact.Id}", UnifiedContactsSource.ORG_CONTACT)
                {
                    DisplayName = orgContactDisplayName,
                    JobTitle = orgContact.JobTitle,
                    Department = orgContact.Department,
                    CompanyName = orgContact.CompanyName,
                };

                if (orgContact.AdditionalData.TryGetValue("imAddresses", out object? imAddresses))
                {
                    if (imAddresses.GetType() == typeof(JsonElement) && ((JsonElement)imAddresses).ValueKind == JsonValueKind.Array)
                    {
                        List<string>? deserializedJsonElement = ((JsonElement)imAddresses).Deserialize<List<string>>();
                        if (deserializedJsonElement != null)
                        {
                            searchResult.ImAddresses = deserializedJsonElement;
                        }
                    }
                }

                searchResult.MailAddresses.Add(orgContact.Mail);

                foreach (Phone phone in orgContact.Phones)
                {
                    switch (phone.Type)
                    {
                        case PhoneType.Home:
                            searchResult.PhoneNumbers.Home.Add(phone.Number);
                            break;

                        case PhoneType.Business:
                            searchResult.PhoneNumbers.Business.Add(phone.Number);
                            break;

                        case PhoneType.Mobile:
                            searchResult.PhoneNumbers.Mobile.Add(phone.Number);
                            break;

                        case PhoneType.Other:
                        case PhoneType.Pager:
                            searchResult.PhoneNumbers.Other.Add(phone.Number);
                            break;

                        default:
                            break; // All Fax types aswell as the type "assistant" and "Radio" are intentionaly ignored here!
                    }
                }

                foreach (PhysicalOfficeAddress address in orgContact.Addresses)
                {
                    if (!string.IsNullOrEmpty(address.Street) || !string.IsNullOrEmpty(address.PostalCode) || !string.IsNullOrEmpty(address.City) || !string.IsNullOrEmpty(address.CountryOrRegion))
                    {
                        searchResult.Addresses.Business.Add(new SearchResultAddress(address.Street, address.PostalCode, address.City, address.CountryOrRegion));
                    }
                }

                returnDtos.Add(searchResult);
            }
            return returnDtos;
        }

        public async Task<IEnumerable<SearchEngineResultDto>> SearchContactAsync(string searchQuery, string delegatedToken, ClaimsPrincipal userPrincipal)
        {
            GraphServiceClient graphClient = _graphApiEngine.AuthorizeWithOnBehalfOfToken(delegatedToken);

            OrgContactCollectionResponse? orgContacts;

            try
            {
                //TODO readd the select as soon Graph API fixed the phones select (Phones are not returned even if selected)
                orgContacts = await graphClient.Contacts.GetAsync((requestConfiguration) =>
                {
                    requestConfiguration.QueryParameters.Filter = ORG_CONTACTS_GRAPH_FILTER_TEMPLATE.Replace(SEARCH_QUERY_PLACEHOLDER, searchQuery.Replace("'", "''"));
                    requestConfiguration.QueryParameters.Count = true;
                    requestConfiguration.Headers.Add("ConsistencyLevel", "eventual");
                    requestConfiguration.QueryParameters.Select = new string[] { "id", "displayName", "mail", "addresses", "companyName", "phones", "imAddresses", "jobTitle", "department" };
                });
            }
            catch (ApiException e)
            {
                if (e.ResponseStatusCode == StatusCodes.Status403Forbidden)
                {
                    throw new UnauthorizedAccessException("Forbidden");
                }
                else
                {
                    throw;
                }
            }
            return ConvertToSearchEnginerResults(orgContacts.Value);
        }

        public async Task<IEnumerable<SearchEngineResultDto>> GetFavoritesAsync(IEnumerable<string> contactIds, string delegatedToken, ClaimsPrincipal userPrincipal)
        {
            List<string> orgContactIds = contactIds.Where(contactId => contactId.StartsWith($"{UnifiedContactStaticStrings.CONTACT_ID_PREFIX_ORG_CONTACT}_")).ToList().ConvertAll(contactId => contactId.Replace($"{UnifiedContactStaticStrings.CONTACT_ID_PREFIX_ORG_CONTACT}_", string.Empty));
            if (orgContactIds.Count == 0)
            {
                return new List<SearchEngineResultDto>();
            }

            GraphServiceClient graphClient = _graphApiEngine.AuthorizeWithOnBehalfOfToken(delegatedToken);

            Dictionary<string, OrgContact> orgContactsItemBatchResponses = new Dictionary<string, OrgContact>();
            try
            {
                RequestInformation orgContactsBatchRequests = new RequestInformation();
                BatchRequestContentCollection batchRequestContent = new BatchRequestContentCollection(graphClient);
                List<string> stepIds = new List<string>();
                foreach (string? orgContactId in orgContactIds)
                {
                    orgContactsBatchRequests = graphClient.Contacts[orgContactId].ToGetRequestInformation();
                    stepIds.Add(await batchRequestContent.AddBatchRequestStepAsync(orgContactsBatchRequests));
                }

                BatchResponseContentCollection batchResponseContent = await graphClient.Batch.PostAsync(batchRequestContent);
                foreach (string step in stepIds)
                {
                    try
                    {
                        OrgContact orgContact = await batchResponseContent.GetResponseByIdAsync<OrgContact>(step);
                        orgContactsItemBatchResponses.Add(step, orgContact);
                    }
                    // Favorited org contact was deleted; skip it instead of failing the whole favorites request.
                    catch (ApiException e) when (e.ResponseStatusCode == StatusCodes.Status404NotFound)
                    {
                        continue;
                    }
                }
            }
            catch (ApiException e)
            {
                if (e.ResponseStatusCode == StatusCodes.Status403Forbidden)
                {
                    throw new UnauthorizedAccessException("Forbidden");
                }
                else
                {
                    throw;
                }
            }

            return ConvertToSearchEnginerResults(orgContactsItemBatchResponses.Values);
        }
    }
}