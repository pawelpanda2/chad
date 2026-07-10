using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SharpContainerProg.AAPublic;

namespace SharpContainerProg.Containers;

public class DefaultContainer : DefaultContainerBase
{
    public DefaultContainer()
    {
        ServiceCollection = new ServiceCollection();
    }

    public DefaultContainer(IServiceCollection serviceCollection)
    {
        ServiceCollection = serviceCollection;
    }

    public void SetServiceProvider(
        IServiceProvider serviceProvider)
    {
        ServiceProvider = serviceProvider;
    }
    
    public void SetConfigManager(
        ConfigurationManager configManager)
    {
        ConfigurationManager = configManager;
    }
}
