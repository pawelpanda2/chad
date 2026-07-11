namespace BackendAdapters.Operations.TwoDigitsString;

public interface ITwoDigitsStringOperations
{
    string FromInt(
        int? index);

    int TryToInt(
        string input);

    bool IsTwoDigit(
        string input);
}
