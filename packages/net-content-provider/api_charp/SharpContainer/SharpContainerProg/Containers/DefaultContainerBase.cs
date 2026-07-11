using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SharpContainerProg.AAPublic;

namespace SharpContainerProg.Containers;

public class DefaultContainerBase : IContainer4
{
    private bool _isBuildDone;
    public IServiceCollection ServiceCollection { get; protected set; }

    private IServiceProvider _serviceProvider;
    private bool _isNothingRegistered = true;

    public IServiceProvider ServiceProvider { get; protected set; }

    public ConfigurationManager ConfigurationManager { get; protected set; }

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

    public void RegisterByFunc<RegT>(
        Func<RegT> func,
        int type = 0,
        Action endAction = null)
            where RegT : class
    {
        if (type == 0)
        {
            ServiceCollection.AddSingleton<RegT>(
                func.Invoke());
        }
        if (type == 1)
        {
            ServiceCollection.AddTransient<RegT>(sp =>
                func.Invoke());
        }
        if (type == 2)
        {
            ServiceCollection.AddScoped<RegT>(sp =>
                func.Invoke());
        }

        if (endAction != null)
        {
            endAction.Invoke();
        }
    }
    
    public void RegisterByFunc<P1, RegT>(
        Func<P1, RegT> regTfunc,
        Func<P1> p1Tfunc,
        int type = 0,
        Action endAction = null)
        where RegT : class
        where P1 : class
    {
        if (type == 0)
        {
            ServiceCollection.AddSingleton<RegT>(
                sp => regTfunc.Invoke(
                    p1Tfunc.Invoke()));
        }
        if (type == 1)
        {
            ServiceCollection.AddTransient<RegT>(
                sp => regTfunc.Invoke(
                    p1Tfunc.Invoke()));
        }
        if (type == 2)
        {
            ServiceCollection.AddScoped<RegT>(
                sp => regTfunc.Invoke(
                    p1Tfunc.Invoke()));
        }
        
        if (endAction != null)
        {
            endAction.Invoke();
        }
    }
    
    public void RegisterByFunc<P1, P2, RegT>(
        Func<P1, P2, RegT> regTfunc,
        Func<P1> p1Tfunc,
        Func<P2> p2Tfunc,
        int type = 0,
        Action endAction = null)
        where RegT : class
        where P1 : class
    {
        if (type == 0)
        {
            ServiceCollection.AddSingleton<RegT>(
                sp => regTfunc.Invoke(
                    p1Tfunc.Invoke(),
                    p2Tfunc.Invoke()));
        }
        if (type == 1)
        {
            ServiceCollection.AddTransient<RegT>(
                sp => regTfunc.Invoke(
                    p1Tfunc.Invoke(),
                    p2Tfunc.Invoke()));
        }
        if (type == 2)
        {
            ServiceCollection.AddScoped<RegT>(
                sp => regTfunc.Invoke(
                    p1Tfunc.Invoke(),
                    p2Tfunc.Invoke()));
        }
        
        if (endAction != null)
        {
            endAction.Invoke();
        }
    }

    public T Resolve<T>()
    {
        DoIfNotYetBuild();
        object? service = ServiceProvider.GetService(typeof(T));
        return (T)service!;
    }

    public object? Resolve(
        Type type)
    {
        DoIfNotYetBuild();
        object? service = ServiceProvider.GetService(type);
        return service;
    }
    
    public bool IsRegistered<T>()
    {
        bool isRegistered = ServiceCollection
            .Any(sd => sd.ServiceType == typeof(T));
        return isRegistered;
    }
    
    private void DoIfNotYetBuild()
    {
        if (_isBuildDone)
        {
            return;
        }
        
        ServiceProvider = ServiceCollection.BuildServiceProvider();
    }
}
