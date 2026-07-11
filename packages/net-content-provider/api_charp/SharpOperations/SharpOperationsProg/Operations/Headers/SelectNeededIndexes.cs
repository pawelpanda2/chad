namespace SharpOperationsProg.Operations.Headers;

public class HeadersOperationsSelectNeeded
{
    private readonly HeadersOperationsConversion conversion;

    public HeadersOperationsSelectNeeded()
    {
        conversion = new HeadersOperationsConversion();
    }

    public List<(string Type, int Index)> GetNeededIndexes(
        List<int> cellsIndexes,
        List<(string Type, int Level, object Value)> convertedList)
    {
        try
        {
            var columnCount = convertedList.Select(x => x.Level).Max();
            var neededIndexes = new List<(string, int)>();
            var j = -1;
            for (int i = 0; i < cellsIndexes.Count; i++)
            {
                var rem = i % columnCount;
                int div = i / columnCount;
                if (rem == 0) { j++; }

                (string Type, int Level, object Value) elem = default;
                try
                {
                    elem = convertedList[j];
                }
                catch (Exception ex) { }

                var isTaken = IsTaken(elem, rem);
                if (isTaken)
                {
                    try
                    {
                        neededIndexes.Add((elem.Type, cellsIndexes[i]));
                    }
                    catch (Exception ex) { }
                }
            }

            return neededIndexes;
        }
        catch (Exception ex){ }

        return default;
    }

    private bool IsTaken(
        (string Type, int Level, object value) elem, int n)
    {
        int n2 = -1;
        if (elem.Type == ElementType.LinesList.ToString())
        {
            n2 = elem.Level - 1;
        }

        if (elem.Type == ElementType.Header.ToString())
        {
            n2 = elem.Level - 2;
        }

        if (n == n2)
        {
            return true;
        }

        return false;
    }

    public void CheckCorrectnes(
        List<(string, int)> neededIdexes,
        List<(string Type, int Level, object Value)> convertedList)
    {
        if (neededIdexes.Count != convertedList.Count)
        {
            throw new Exception();
        }
    }

    public List<(string, int)> FinalIndexes(
        List<(string, int)> neededIdexes,
        List<(string Type, int Level, object Value)> convertedList)
    {
        var addedCount = 0;
        var r = 0;
        for (int i = 0; i < convertedList.Count; i++)
        {
            var converted = convertedList[i];
            var index = neededIdexes[i];
            if (converted.Value is string converted2)
            {
                neededIdexes[i] = (index.Item1, index.Item2 + addedCount);
                addedCount += converted2.Length;
            }
            if (converted.Value is List<string> tmp2)
            {
                neededIdexes[i] = (index.Item1, index.Item2 + addedCount);
                addedCount += string.Join('\n', tmp2).Length;
            }
        }

        return neededIdexes;
    }
}