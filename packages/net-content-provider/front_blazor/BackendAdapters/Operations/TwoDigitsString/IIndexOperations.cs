namespace BackendAdapters.Operations.TwoDigitsString;

internal class IIndexOperations
{
    private char slash = '/';
    public int GetLocaLast(string loca)
    {
        var tmp = loca.Split("/");
        var lastString = tmp.Last();
        var last = StringToIndex(lastString);
        return last;
    }

    public string GetAddressString((string, string) adrTuple)
    {
        if (string.IsNullOrEmpty(adrTuple.Item2))
        {
            return adrTuple.Item1;
        }

        var address = adrTuple.Item1 + "/" + adrTuple.Item2;
        return address;
    }

    public (string, string) SelectAddress(
        (string Repo, string Loca) address,
        int index)
    {
        // AddIndexToAddress
        var newLoca = address.Loca + slash + IndexToString(index);
        return (address.Repo, newLoca);
    }

    public (string, string) JoinIndexWithLoca(
        (string Repo, string Loca) adrTuple, int? index)
    {
        if (index == null)
        {
            return adrTuple;
        }

        var idxString = IndexToString(index);

        var newLoca = JoinLoca(adrTuple.Loca, idxString);
        var newAdrTuple = (adrTuple.Repo, newLoca);
        return newAdrTuple;
    }

    public (string, string) AdrTupleJoinLoca(
        (string Repo, string Loca) adrTuple, string loca)
    {
        if (loca == string.Empty)
        {
            return adrTuple;
        }

        var newLoca = JoinLoca(adrTuple.Loca, loca);
        var newAdrTuple = (adrTuple.Repo, newLoca);
        return newAdrTuple;
    }

    public string JoinLoca(string loca01, string loca02)
    {
        if (loca01 == string.Empty)
        {
            return loca02;
        }

        var newLoca = loca01 + "/" + loca02;
        return newLoca;
    }


    public string IndexToString(int? index)
    {
        if (index < 10)
        {
            return "0" + index;
        }
        if (index < 100)
        {
            return index.ToString();
        }
        if (index < 1000)
        {
            return index.ToString();
        }

        throw new Exception();
    }

    public int StringToIndex(string input)
    {
        if (input.Length > 3)
        {
            throw new Exception();
        }

        var index = int.Parse(input);
        return index;
    }

    public bool TryStringToIndex(string input, out int index)
    {
        if (input.Length > 3)
        {
            index = -1;
            return false;
        }

        var s1 = int.TryParse(input, out index);
        return s1;
    }

    public string LastTwoChar(string input)
    {
        var lastTwo = input.Substring(input.Length - 2, 2);
        return lastTwo;
    }

    public bool IsCorrectIndex(string input)
    {
        var lastTwo = LastTwoChar(input);
        var success = TryStringToIndex(lastTwo, out var index);

        return success;
    }

    public bool IsCorrectIndex(string input, out int index)
    {
        var lastTwo = LastTwoChar(input);
        var success = TryStringToIndex(lastTwo, out index);

        return success;
    }
}
