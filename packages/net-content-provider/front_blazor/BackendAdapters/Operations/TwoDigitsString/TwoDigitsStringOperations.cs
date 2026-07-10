namespace BackendAdapters.Operations.TwoDigitsString;

public class TwoDigitsStringOperations
    : ITwoDigitsStringOperations
{
    public string FromInt(
        int? index)
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

    public int TryToInt(
        string input)
    {
        if (input.Length > 3)
        {
            throw new Exception();
        }

        bool success = int.TryParse(input, out int result);
        return result;
    }

    public bool IsTwoDigit(
        string input)
    {
        bool success = int.TryParse(input, out int result);
        return success;
    }
}
