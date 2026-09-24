namespace UnifiedContacts.Statics
{
    public static class ODataFilterHelper
    {
        // Caps how many whitespace-separated search terms get AND'd together, so the rendered filter
        // stays well under Graph's 2,048 character advanced-query URL limit.
        private const int MAX_TOKENIZED_TERMS = 3;

        /// <summary>
        /// Escapes single quotes so a raw user input is safe to embed inside an OData string literal
        /// </summary>
        public static string EscapeODataStringLiteral(string value)
        {
            return value.Replace("'", "''");
        }

        /// <summary>
        /// Splits the query into whitespace separated terms (up to <see cref="MAX_TOKENIZED_TERMS"/>) and ANDs one
        /// filter group per term, so multi-word queries (e.g. "John Doe") also match contacts where the terms are
        /// spread across different fields (e.g. givenName + surname). Each occurrence of <paramref name="placeholder"/>
        /// in <paramref name="filterTemplate"/> is replaced with the escaped term; the template must be a single,
        /// self-contained (parenthesized) filter group.
        /// </summary>
        public static string BuildTokenizedFilter(string filterTemplate, string placeholder, string searchQuery)
        {
            string[] terms = searchQuery.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (terms.Length == 0)
            {
                terms = new[] { searchQuery };
            }

            return string.Join(" and ", terms.Take(MAX_TOKENIZED_TERMS).Select(term => filterTemplate.Replace(placeholder, EscapeODataStringLiteral(term))));
        }
    }
}
