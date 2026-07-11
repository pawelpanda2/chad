using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;

namespace SharpContainerProg.AAPublic;
public interface IContainer4
{
    IServiceCollection ServiceCollection { get; }
    IServiceProvider ServiceProvider { get; }
    ConfigurationManager ConfigurationManager { get; }

    void SetConfigManager(
        ConfigurationManager configManager);
    
    void SetServiceProvider(
        IServiceProvider serviceProvider);
    void RegisterByFunc<RegT>(
        Func<RegT> func,
        int type = 0,
        Action endAction = null)
        where RegT : class;
    
    void RegisterByFunc<P1, RegT>(
        Func<P1, RegT> regTfunc,
        Func<P1> p1Tfunc,
        int type = 0,
        Action endAction = null)
        where RegT : class
        where P1 : class;

    void RegisterByFunc<P1, P2, RegT>(
        Func<P1, P2, RegT> regTfunc,
        Func<P1> p1Tfunc,
        Func<P2> p2Tfunc,
        int type = 0,
        Action endAction = null)
        where RegT : class
        where P1 : class;

    T Resolve<T>();

    object? Resolve(
        Type type);

    bool IsRegistered<T>();
}
