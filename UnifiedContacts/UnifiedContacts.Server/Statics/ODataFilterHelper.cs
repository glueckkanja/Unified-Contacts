namespace UnifiedContacts.Statics
{
    public static class ODataFilterHelper
    {
        // Caps how many whitespace-separated search terms get AND'd together.
        private const int MAX_TOKENIZED_TERMS = 3;

        // Trims each term so a single long token can't multiply out across every field clause of the template.
        private const int MAX_TERM_LENGTH = 64;

        // Safe ceiling for the URL-encoded $filter so the whole request URL stays well under Graph's ~2,048 char limit.
        private const int MAX_ENCODED_FILTER_LENGTH = 1500;

        private const string TERM_SEPARATOR = " and ";

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
        /// The first term-group is always emitted; further groups are only added while the URL-encoded filter (including
        /// any <paramref name="appendedFilter"/> the caller concatenates afterwards) stays under Graph's URL limit. Terms
        /// dropped here are still enforced client-side by the calling controller, so no results are lost, only the risk
        /// of a filter too large for Graph to accept.
        /// </summary>
        public static string BuildTokenizedFilter(string filterTemplate, string placeholder, string searchQuery, string appendedFilter = "")
        {
            string[] terms = searchQuery.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (terms.Length == 0)
            {
                terms = new[] { searchQuery };
            }

            int encodedBudget = MAX_ENCODED_FILTER_LENGTH - Uri.EscapeDataString(appendedFilter ?? string.Empty).Length;
            int encodedSeparatorLength = Uri.EscapeDataString(TERM_SEPARATOR).Length;

            List<string> renderedGroups = new List<string>();
            int usedEncodedLength = 0;

            foreach (string term in terms.Take(MAX_TOKENIZED_TERMS))
            {
                string clampedTerm = term.Length > MAX_TERM_LENGTH ? term.Substring(0, MAX_TERM_LENGTH) : term;
                string renderedGroup = filterTemplate.Replace(placeholder, EscapeODataStringLiteral(clampedTerm));

                int projectedEncodedLength = usedEncodedLength
                    + (renderedGroups.Count > 0 ? encodedSeparatorLength : 0)
                    + Uri.EscapeDataString(renderedGroup).Length;

                // Always keep the first group; stop before any group that would push the URL over Graph's limit.
                if (renderedGroups.Count > 0 && projectedEncodedLength > encodedBudget)
                {
                    break;
                }

                renderedGroups.Add(renderedGroup);
                usedEncodedLength = projectedEncodedLength;
            }

            return string.Join(TERM_SEPARATOR, renderedGroups);
        }
    }
}
