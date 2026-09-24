using Microsoft.Graph;
using Microsoft.Graph.Models;
using Microsoft.Kiota.Abstractions;
using System.Security.Claims;
using System.Text;
using UnifiedContacts.Interfaces;
using UnifiedContacts.Models;
using UnifiedContacts.Models.Dto;
using UnifiedContacts.Settings;

namespace UnifiedContacts.Engines.SearchEngines
{
    public class AzureADSearchEngine : ISearchEngine
    {
        private readonly IGraphApiEngine _graphApiEngine;
        private readonly AuthSettings _authSettings;
        private readonly RuntimeInfoDto _runtimeInfo;

        private const string SEARCH_QUERY_PLACEHOLDER = "{{{SEARCH_QUERY_PLACEHOLDER}}}";
        private const string ENTRA_ID_FILTER = "{{{ENTRA_ID_FILTER}}}";
        private const string AZURE_AD_GRAPH_FILTER_TEMPLATE = $"(startswith(displayName, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(givenName, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(surname, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(city, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(department, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(jobTitle, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(userPrincipalName, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(mail, '{SEARCH_QUERY_PLACEHOLDER}') or startswith(companyName, '{SEARCH_QUERY_PLACEHOLDER}') or otherMails/any(a:startswith(a, '{SEARCH_QUERY_PLACEHOLDER}'))) {ENTRA_ID_FILTER}";

        public AzureADSearchEngine(IGraphApiEngine graphApiEngine, AuthSettings authSettings, RuntimeInfoDto startupInfo)
        {
            _graphApiEngine = graphApiEngine;
            _authSettings = authSettings;
            _runtimeInfo = startupInfo;
        }

        private List<SearchEngineResultDto> ConvertToSearchEnginerResults(IEnumerable<User> users)
        {
            List<SearchEngineResultDto> returnDtos = new List<SearchEngineResultDto>();
            foreach (User user in users)
            {
                SearchEngineResultDto searchResult = new SearchEngineResultDto($"{UnifiedContactStaticStrings.CONTACT_ID_PREFIX_AZUREAD}_{user.Id}", UnifiedContactsSource.AZURE_AD)
                {
                    DisplayName = user.DisplayName,
                    JobTitle = user.JobTitle,
                    Department = user.Department,
                    CompanyName = user.CompanyName,
                    ImAddresses = user.ImAddresses.ToList(),
                };

                searchResult.MailAddresses.Add(user.Mail);
                searchResult.MailAddresses.AddRange(user.OtherMails);
                searchResult.PhoneNumbers.Business.AddRange(user.BusinessPhones);
                searchResult.PhoneNumbers.Mobile.Add(user.MobilePhone);

                if (!string.IsNullOrEmpty(user.StreetAddress) || !string.IsNullOrEmpty(user.PostalCode) || !string.IsNullOrEmpty(user.City) || !string.IsNullOrEmpty(user.Country))
                {
                    searchResult.Addresses.Business.Add(new SearchResultAddress(user.StreetAddress, user.PostalCode, user.City, user.Country));
                }
                returnDtos.Add(searchResult);
            }
            return returnDtos;
        }

        public async Task<IEnumerable<SearchEngineResultDto>> SearchContactAsync(string searchQuery, string delegatedToken, ClaimsPrincipal userPrincipal)
        {
            GraphServiceClient graphClient = _graphApiEngine.AuthorizeWithOnBehalfOfToken(delegatedToken);
            StringBuilder entraIdFilterString = new StringBuilder();
            UserCollectionResponse? users;
            foreach (RuntimeInfoEntraIdFilter entraIdFilter in _runtimeInfo.EntraIdFilter)
            {
                if (entraIdFilter.IsValid == true)
                {
                    string filter = entraIdFilter.FilterString;
                    entraIdFilterString.Append($" and {filter}");
                }
            }

            try
            {
                users = await graphClient.Users.GetAsync((requestConfiguration) =>
                {
                    requestConfiguration.QueryParameters.Filter = AZURE_AD_GRAPH_FILTER_TEMPLATE.Replace(SEARCH_QUERY_PLACEHOLDER, searchQuery).Replace(ENTRA_ID_FILTER, entraIdFilterString.ToString());
                    requestConfiguration.QueryParameters.Select = new string[] { "id", "imAddresses", "displayName", "mobilePhone", "businessPhones", "companyName", "jobTitle", "department", "streetAddress", "postalCode", "city", "country", "mail", "otherMails" };
                    requestConfiguration.Headers.Add("ConsistencyLevel", "eventual");
                    requestConfiguration.QueryParameters.Count = true;
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

            return ConvertToSearchEnginerResults(users.Value);
        }

        public async Task<IEnumerable<SearchEngineResultDto>> GetFavoritesAsync(IEnumerable<string> contactIds, string delegatedToken, ClaimsPrincipal userPrincipal)
        {
            List<string> userIds = contactIds.Where(contactId => contactId.StartsWith($"{UnifiedContactStaticStrings.CONTACT_ID_PREFIX_AZUREAD}_")).ToList().ConvertAll(contactId => contactId.Replace($"{UnifiedContactStaticStrings.CONTACT_ID_PREFIX_AZUREAD}_", string.Empty));
            if (userIds.Count == 0)
            {
                return new List<SearchEngineResultDto>();
            }

            GraphServiceClient graphClient = _graphApiEngine.AuthorizeWithOnBehalfOfToken(delegatedToken);

            Dictionary<string, User> azureADItemBatchResponses = new Dictionary<string, User>();

            try
            {
                BatchRequestContentCollection batchRequestContent = new BatchRequestContentCollection(graphClient);
                List<string> stepIds = new List<string>();
                foreach (string? userId in userIds)
                {
                    RequestInformation azureADUserBatchRequests = graphClient.Users[userId].ToGetRequestInformation((requestConfiguration) =>
                    {
                        requestConfiguration.QueryParameters.Select = new string[] { "id", "imAddresses", "displayName", "mobilePhone", "businessPhones", "companyName", "jobTitle", "department", "streetAddress", "postalCode", "city", "country", "mail", "otherMails" };
                        requestConfiguration.Headers.Add("ConsistencyLevel", "eventual");
                    });

                    stepIds.Add(await batchRequestContent.AddBatchRequestStepAsync(azureADUserBatchRequests));
                }

                BatchResponseContentCollection batchResponseContent = await graphClient.Batch.PostAsync(batchRequestContent);

                foreach (string step in stepIds)
                {
                    try
                    {
                        User user = await batchResponseContent.GetResponseByIdAsync<User>(step);
                        azureADItemBatchResponses.Add(step, user);
                    }
                    catch (ApiException e)
                    {
                        if (e.ResponseStatusCode == StatusCodes.Status403Forbidden)
                        {
                            throw new UnauthorizedAccessException("Forbidden");
                        }
                        // Favorited user was deleted; skip it instead of failing the whole favorites request.
                        else if (e.ResponseStatusCode == StatusCodes.Status404NotFound)
                        {
                            continue;
                        }
                        else
                        {
                            throw;
                        }
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

            return ConvertToSearchEnginerResults(azureADItemBatchResponses.Values);
        }
    }
}