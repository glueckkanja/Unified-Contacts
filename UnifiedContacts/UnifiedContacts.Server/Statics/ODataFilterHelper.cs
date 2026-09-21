namespace UnifiedContacts.Statics
{
    public static class ODataFilterHelper
    {
        /// <summary>
        /// Escapes single quotes so a raw user input is safe to embed inside an OData string literal
        /// </summary>
        public static string EscapeODataStringLiteral(string value)
        {
            return value.Replace("'", "''");
        }

        /// <summary>
        /// Splits the query into whitespace separated terms and ANDs one filter group per term, so multi-word
        /// queries (e.g. "Magda Lena") also match contacts where the terms are spread across different fields
        /// (e.g. givenName + surname). Each occurrence of <paramref name="placeholder"/> in <paramref name="filterTemplate"/>
        /// is replaced with the escaped term; the template must be a single, self-contained (parenthesized) filter group.
        /// </summary>
        public static string BuildTokenizedFilter(string filterTemplate, string placeholder, string searchQuery)
        {
            string[] terms = searchQuery.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (terms.Length == 0)
            {
                terms = new[] { searchQuery };
            }

            return string.Join(" and ", terms.Select(term => filterTemplate.Replace(placeholder, EscapeODataStringLiteral(term))));
        }
    }
}
