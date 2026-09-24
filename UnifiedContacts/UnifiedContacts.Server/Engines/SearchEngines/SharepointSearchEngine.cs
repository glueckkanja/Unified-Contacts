using Microsoft.Graph;
using Microsoft.Graph.Models;
using Microsoft.Graph.Search.Query;
using Microsoft.Kiota.Abstractions;
using System.Security.Claims;
using System.Text;
using UnifiedContacts.Interfaces;
using UnifiedContacts.Models;
using UnifiedContacts.Models.Dto;
using UnifiedContacts.Settings;

namespace UnifiedContacts.Engines.SearchEngines
{
    public class SharePointSearchEngine : ISearchEngine
    {
        private readonly IGraphApiEngine _graphApiEngine;
        private readonly AuthSettings _authSettings;
        private readonly AppSettings _settings;

        private const string SEARCH_QUERY_PLACEHOLDER = "{{{SEARCH_QUERY_PLACEHOLDER}}}";
        private const string SHAREPOINT_QUERY_STRING_TEMPLATE = $"*{SEARCH_QUERY_PLACEHOLDER}* AND contenttypeid:\"0x010600*\"";

        public SharePointSearchEngine(IGraphApiEngine graphApiEngine, AuthSettings authSettings, AppSettings settings)
        {
            _graphApiEngine = graphApiEngine;
            _authSettings = authSettings;
            _settings = settings;
        }

        private List<SearchEngineResultDto> ConvertToSearchEngineResults(Dictionary<string, ListItem> sharepointItemBatchResponses)
        {
            List<SearchEngineResultDto> returnDtos = new List<SearchEngineResultDto>();
            foreach (KeyValuePair<string, ListItem> listItemKeyValue in sharepointItemBatchResponses)
            {
                ListItem listItem = listItemKeyValue.Value;
                FieldValueSet? listItemFields = listItem.Fields;

                SearchEngineResultDto searchResult = new SearchEngineResultDto($"{UnifiedContactStaticStrings.CONTACT_ID_PREFIX_SHAREPOINT}_{listItemKeyValue.Key}", UnifiedContactsSource.SHAREPOINT);

                if (listItemFields.AdditionalData.TryGetValue("FullName", out object? fullName))
                {
                    searchResult.DisplayName = fullName.ToString();
                }
                else if (listItemFields.AdditionalData.TryGetValue("FirstName", out object? firstName))
                {
                    searchResult.DisplayName = firstName.ToString();
                }
                if (listItemFields.AdditionalData.TryGetValue("EMail", out object? eMail))
                {
                    searchResult.MailAddresses.Add(eMail.ToString()!);
                }
                if (listItemFields.AdditionalData.TryGetValue("Company", out object? company))
                {
                    searchResult.CompanyName = company.ToString();
                }
                if (listItemFields.AdditionalData.TryGetValue("JobTitle", out object? jobTitle))
                {
                    searchResult.JobTitle = jobTitle.ToString();
                }
                if (listItemFields.AdditionalData.TryGetValue("WorkPhone", out object? workPhone))
                {
                    searchResult.PhoneNumbers.Business.Add(workPhone.ToString()!);
                }
                if (listItemFields.AdditionalData.TryGetValue("HomePhone", out object? homePhone))
                {
                    searchResult.PhoneNumbers.Home.Add(homePhone.ToString()!);
                }
                if (listItemFields.AdditionalData.TryGetValue("CellPhone", out object? cellPhone))
                {
                    searchResult.PhoneNumbers.Mobile.Add(cellPhone.ToString()!);
                }
                if (listItemFields.AdditionalData.TryGetValue("Department", out object? department))
                {
                    searchResult.Department = (department.ToString());
                }

                listItemFields.AdditionalData.TryGetValue("WorkAddress", out object? workAddressRaw);
                listItemFields.AdditionalData.TryGetValue("WorkCity", out object? workCityRaw);
                listItemFields.AdditionalData.TryGetValue("WorkZip", out object? workZipRaw);
                listItemFields.AdditionalData.TryGetValue("WorkCountry", out object? workCountryRaw);

                string? ucWorkAddress = $"{workAddressRaw}";
                string? workCity = $"{workCityRaw}";
                string? workZip = $"{workZipRaw}";
                string? workCountry = $"{workCountryRaw}";

                if (!string.IsNullOrWhiteSpace(ucWorkAddress) || !string.IsNullOrWhiteSpace(workCity) || !string.IsNullOrWhiteSpace(workZip) || !string.IsNullOrWhiteSpace(workCountry))
                {
                    searchResult.Addresses.Business.Add(new SearchResultAddress(ucWorkAddress, workZip, workCity, workCountry));
                }

                returnDtos.Add(searchResult);
            }
            return returnDtos;
        }

        public async Task<IEnumerable<SearchEngineResultDto>> SearchContactAsync(string searchQuery, string delegatedToken, ClaimsPrincipal userPrincipal)
        {
            GraphServiceClient graphClient = _graphApiEngine.AuthorizeWithOnBehalfOfToken(delegatedToken);

            Site? rootSite = await graphClient.Sites["root"].GetAsync((requestConfiguration) =>
            {
                requestConfiguration.QueryParameters.Select = ["SiteCollection"];
            });
            string? rootHostName = rootSite.SiteCollection.Hostname;

            Dictionary<string, ListItem> sharepointItemBatchResponses = [];
            try
            {
                QueryPostRequestBody requestBody = new QueryPostRequestBody
                {
                    Requests = new List<SearchRequest>
                    {
                        new SearchRequest()
                        {
                            EntityTypes = new List<EntityType?>()
                            {
                                EntityType.ListItem,
                            },
                             Query = new SearchQuery() {
                                 QueryString = SHAREPOINT_QUERY_STRING_TEMPLATE.Replace(SEARCH_QUERY_PLACEHOLDER, searchQuery)
                             },
                            From = 0,
                            Size = 100,
                            Fields = new List<string>()
                            {
                                "siteId",
                                "webId",
                                "listId",
                                "listItemId",
                                "id"
                            },
                        },
                    },
                };

                QueryPostResponse? searchEntityQueryCollection = await graphClient.Search.Query.PostAsQueryPostResponseAsync(requestBody);

                Dictionary<string, HttpRequestMessage> sharepointItemBatchRequests = new Dictionary<string, HttpRequestMessage>();
                List<string> stepIds = new List<string>();
                BatchRequestContentCollection batchRequestContent = new BatchRequestContentCollection(graphClient);
                foreach (SearchResponse searchResponse in searchEntityQueryCollection.Value)
                {
                    if (searchResponse == null || searchResponse.HitsContainers == null)
                    {
                        continue;
                    }
                    foreach (SearchHitsContainer hitsContainer in searchResponse.HitsContainers)
                    {
                        if (hitsContainer == null || hitsContainer.Hits == null)
                        {
                            continue;
                        }
                        foreach (SearchHit hit in hitsContainer.Hits)
                        {
                            if (hit != null && hit.Resource.GetType() == typeof(ListItem))
                            {
                                ListItem listItem = (ListItem)hit.Resource;
                                FieldValueSet? fields = listItem.Fields;
                                if (fields.AdditionalData.TryGetValue("siteId", out object? siteId) && fields.AdditionalData.TryGetValue("webId", out object? webId) && fields.AdditionalData.TryGetValue("listId", out object? listId) && fields.AdditionalData.TryGetValue("listItemId", out object? listItemId) && !string.IsNullOrWhiteSpace(listItem.Id))
                                {
                                    string sharepointUniqueId = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{siteId};{webId};{listId};{listItemId}"));

                                    RequestInformation requestInformation = graphClient.Sites[$"{rootHostName},{siteId},{webId}"].Lists[$"{listId}"].Items[$"{listItemId}"].ToGetRequestInformation(
                                        (requestConfiguration) =>
                                        {
                                            requestConfiguration.QueryParameters.Select = new string[] { "id", "fields" };
                                            requestConfiguration.QueryParameters.Expand = new string[] { "fields" };
                                        }
                                    );
                                    stepIds.Add(await batchRequestContent.AddBatchRequestStepAsync(requestInformation));
                                }
                            }
                        }
                    }
                }

                BatchResponseContentCollection batchResponseContent = await graphClient.Batch.PostAsync(batchRequestContent);
                foreach (string step in stepIds)
                {
                    ListItem listItem = await batchResponseContent.GetResponseByIdAsync<ListItem>(step);
                    if (listItem != null)
                    {
                        sharepointItemBatchResponses.Add(step, listItem);
                    }
                }
            }
            catch (ApiException e)
            {
                if (e.ResponseStatusCode == (int)System.Net.HttpStatusCode.Forbidden)
                {
                    throw new UnauthorizedAccessException("Forbidden");
                }
                else
                {
                    throw;
                }
            }

            return ConvertToSearchEngineResults(sharepointItemBatchResponses);
        }

        public async Task<IEnumerable<SearchEngineResultDto>> GetFavoritesAsync(IEnumerable<string> contactIds, string delegatedToken, ClaimsPrincipal userPrincipal)
        {
            List<string> sharepointContactIds = contactIds.Where(contactId => contactId.StartsWith($"{UnifiedContactStaticStrings.CONTACT_ID_PREFIX_SHAREPOINT}_")).ToList().ConvertAll(contactId => contactId.Replace($"{UnifiedContactStaticStrings.CONTACT_ID_PREFIX_SHAREPOINT}_", string.Empty));
            if (sharepointContactIds.Count == 0)
            {
                return new List<SearchEngineResultDto>();
            }

            Dictionary<string, HttpRequestMessage> sharepointItemBatchRequests = new Dictionary<string, HttpRequestMessage>();
            GraphServiceClient graphClient = _graphApiEngine.AuthorizeWithOnBehalfOfToken(delegatedToken);

            Site? rootSite = await graphClient.Sites["root"].GetAsync((requestConfiguration) =>
            {
                requestConfiguration.QueryParameters.Select = new string[] { "SiteCollection" };
            });
            string? rootHostName = rootSite.SiteCollection.Hostname;
            BatchRequestContentCollection batchRequestContent = new BatchRequestContentCollection(graphClient);
            List<string> stepIds = new List<string>();
            Dictionary<string, ListItem> sharepointItemBatchResponses = new Dictionary<string, ListItem>();

            foreach (string? sharepointContactId in sharepointContactIds)
            {
                string rawSharePointId = Encoding.UTF8.GetString(Convert.FromBase64String(sharepointContactId));
                string[] decodedContactId = rawSharePointId.Split(";");
                if (decodedContactId.Length != 4)
                {
                    continue;
                }
                string siteId = decodedContactId[0];
                string webId = decodedContactId[1];
                string listId = decodedContactId[2];
                string listItemId = decodedContactId[3];

                RequestInformation requestInformation = graphClient.Sites[$"{rootHostName},{siteId},{webId}"].Lists[$"{listId}"].Items[$"{listItemId}"].ToGetRequestInformation(
                                       (requestConfiguration) =>
                                       {
                                           requestConfiguration.QueryParameters.Select = new string[] { "id", "fields" };
                                           requestConfiguration.QueryParameters.Expand = new string[] { "fields" };
                                       }
                );
                stepIds.Add(await batchRequestContent.AddBatchRequestStepAsync(requestInformation));
            }

            BatchResponseContentCollection batchResponseContent = await graphClient.Batch.PostAsync(batchRequestContent);
            foreach (string step in stepIds)
            {
                try
                {
                    ListItem listItem = await batchResponseContent.GetResponseByIdAsync<ListItem>(step);
                    if (listItem != null)
                    {
                        sharepointItemBatchResponses.Add(step, listItem);
                    }
                }
                // Favorited SharePoint item was deleted; skip it instead of failing the whole favorites request.
                catch (ApiException e) when (e.ResponseStatusCode == (int)System.Net.HttpStatusCode.NotFound)
                {
                    continue;
                }
            }
            return ConvertToSearchEngineResults(sharepointItemBatchResponses);
        }
    }
}