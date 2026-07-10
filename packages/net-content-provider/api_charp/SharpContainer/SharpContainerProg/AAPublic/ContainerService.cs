using SharpContainerProg.Containers;

namespace SharpContainerProg.AAPublic;

public static class ContainerService
{
    private static Dictionary<string, IContainer4> _myContainerDict
        = new Dictionary<string, IContainer4>();
    private static IContainer4? _outContainer;
    
    public static IContainer4 MyContainer(
        string assemblyName)
    {
        bool isPresent = _myContainerDict.ContainsKey(assemblyName);
        if (!isPresent)
        {
            _myContainerDict.Add(assemblyName, new DefaultContainer());
        }
        IContainer4 myContainer = _myContainerDict[assemblyName];
        return myContainer;
    }
    
    public static IContainer4 OutContainer
    {
        get
        {
            PrivateSetOutContainer();
            return _outContainer;
        }
        private set
        {
            _outContainer = value;
        }
    }

    private static void PrivateSetOutContainer()
    {
        if (_outContainer == null)
        {
            _outContainer = new DefaultContainer();
        }
    }

    public static void SetOutContainer(
        IContainer4 container)
    {
        if (_outContainer != null)
        {
            throw new Exception();
        }
        
        OutContainer = container;
    }

    public static void SetOutContainer()
    {
        if (_outContainer != null)
        {
            throw new Exception();
        }

        _outContainer = new DefaultContainer();
    }
}
