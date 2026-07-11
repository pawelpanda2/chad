namespace BlazorApp.Workers;

public class AddressCheck
{
    public bool IsOK((string repo, string loca) adrTuple)
    {
        return IsOK(adrTuple.repo, adrTuple.loca);
    }
    
    public bool IsOK(
        string repo,
        string loca)
    {
        bool isGuid = Guid.TryParse(repo, out _);
        if (isGuid)
        {
            return false;
        }

        return true;
    }
}