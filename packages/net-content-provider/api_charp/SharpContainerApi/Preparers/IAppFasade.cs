using Microsoft.AspNetCore.Builder;
using SharpContainerProg.AAPublic;

namespace SharpConfigProg;

public interface IAppFasade
{
    WebApplicationBuilder WebAppBuilder { get; }
    WebApplication WebApp { get; }
    IContainer4 Container { get; }
    List<Action<WebApplication>> WebAppActionsList { get; }
    void Run();
}
