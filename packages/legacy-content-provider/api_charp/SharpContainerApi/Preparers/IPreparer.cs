namespace SharpConfigProg.AAPublic;

public interface IPreparer
{
    Dictionary<string, object> Prepare();
    IAppFasade AppFasade { get; }
}
