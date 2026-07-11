using System.Reflection;

namespace SharpOperationsProg.AAPublic.Operations;

public class StrategyBase<T>
{
    protected readonly List<Type> _possibleStrategies;
    protected T _strategy;
    
    private AssemblyName GetAssemblyName(object obj)
    {
        var assembly = Assembly.GetAssembly(obj.GetType());
        var assebmlyName = assembly.GetName();
        return assebmlyName;
    }
    
    public StrategyBase()
    {
        Type interfaceType = typeof(T);
        Assembly assembly = interfaceType.Assembly;
        _possibleStrategies = assembly.GetTypes()
            .Where(mytype => mytype.GetInterfaces().Contains(interfaceType))
            .ToList();
    }
    
    public T GetNewStrategy(string name)
    {
        if (_possibleStrategies.Count < 1)
        {
            throw new Exception();
        }

        IEnumerable<Type> match = _possibleStrategies.Where(x => x.Name == name);
        if (match.Count() != 1)
        {
            throw new Exception();
        }
        
        Type type = _possibleStrategies.Single(x => x.Name == name);
        object? obj = Activator.CreateInstance(type);
        T? newStrategy = (T)obj;
        return newStrategy;
    }

    public bool SetNewStrategy(string name)
    {
        var newStrategy = GetNewStrategy(name);
        if (default(T).Equals(newStrategy))
        {
            return false;
        }
        
        _strategy = newStrategy;
        return true;
    }
}