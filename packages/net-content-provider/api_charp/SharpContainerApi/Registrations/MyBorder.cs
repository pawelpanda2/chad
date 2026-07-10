using System.Reflection;
using SharpContainerProg.AAPublic;

namespace SimpleRun;

public static class MyBorder
{
    private static string AssemblyName => Assembly
        .GetExecutingAssembly().FullName;
    
    public static IContainer4 MyContainer =
        ContainerService.MyContainer(
            AssemblyName);
    public static Registration Registration = new Registration();
    public static bool IsRegistered = Registration.Start(IsRegistered);
    public static IContainer4 OutContainer => Registration.OutContainer;
}