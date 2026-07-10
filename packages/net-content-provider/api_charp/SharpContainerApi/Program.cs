using SharpConfigProg.AAPublic;
using SimpleRun;

IPreparer defaultPreparer = new DefaultPreparer();
defaultPreparer.Prepare();
defaultPreparer.AppFasade.Run();

public record InvokeRequest(string[] Args);