using Microsoft.Extensions.DependencyInjection;

namespace SharpContainerProg.AAPublic;

public interface IContainer2
{
    public ServiceCollection serviceRegister { get; }
    
    public IServiceProvider serviceProvider { get; }
}
