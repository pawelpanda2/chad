namespace BackendAdapters.Operations.NoSqlAddress;

public interface INoSqlAddressOperations
{
    string GetAddressString(
        (string Repo, string Loca) adrTuple,
        string separator = "/");
    string MoveOneLocaBack(string adrString);

    (string, string) CreateAdrTupleFromAddress(
        string addressString);

    (string, string) CreateAddressFromUrlParameter(
        string addressString);

    (string, string) JoinIndexWithLoca(
        (string Repo, string Loca) adrTuple,
        int? index);

    string JoinLoca(string loca01, string loca02);

    public string CreateUrl(
        (string Repo, string Loca) adrTuple,
        string baseName);
}