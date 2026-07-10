using SharpContainerProg.AAPublic;
using SharpContainerProg.Containers;

namespace SharpConfigProg;

public class AppFasade : IAppFasade
{
    // Container
    public IContainer4 Container { get; private set; }
    
    // Building services
    public WebApplicationBuilder WebAppBuilder { get; private set; }
    public IServiceCollection ServicesCollection { get; private set; }
    
    // App services
    public WebApplication WebApp { get; private set; }
    public IServiceProvider ServiceProvider { get; private set; }
    public List<Action<WebApplication>> WebAppActionsList { get; }
    
    public AppFasade()
    {
        WebAppBuilder = WebApplication.CreateBuilder();
        Container = new DefaultContainer(WebAppBuilder.Services);
        ServicesCollection = WebAppBuilder.Services;
        
        WebAppActionsList = new();
    }

    public void Run()
    {
        WebApp = WebAppBuilder.Build();
        ServiceProvider = WebApp.Services;
        ApplyAllActions();
        WebApp.Run();
    }
    private void ApplyAllActions()
    {
        foreach (var action in WebAppActionsList)
        {
            action.Invoke(WebApp);
        }
    }
}
