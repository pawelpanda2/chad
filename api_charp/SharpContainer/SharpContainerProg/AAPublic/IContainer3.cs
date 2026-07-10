using Microsoft.Extensions.DependencyInjection;

namespace SharpContainerProg.AAPublic;

public interface IContainer3
{
    bool IsRegistered<T>();
    IContainer3 RegisterSingleton<T>(params object[] injectionMember);

    IContainer3 RegisterSingleton<T>(
        object service);
    IContainer3 RegisterType<T>(params object[] injectionMember);
    T Resolve<T>();
    object Resolve(Type type);
    void FillServiceCollection(IServiceCollection serviceCollection);
}