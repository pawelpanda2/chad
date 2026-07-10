namespace SharpOperationsProg.AAPublic.Operations;

public interface IIndexOperations
{
    string GetAddressString((string, string) adrTuple);
    (string, string) SelectAddress((string Repo, string Loca) address, int index);
    string IndexToString(int? index);

    public int StringToIndex(string input);
    
    bool TryStringToIndex(string input, out int index);
    string LastTwoChar(string input);
    bool IsCorrectIndex(string input);
    bool IsCorrectIndex(string input, out int index);
    int GetLocaLast(string loca);
    (string, string) JoinIndexWithLoca((string Repo, string Loca) adrTuple, int? index);

}