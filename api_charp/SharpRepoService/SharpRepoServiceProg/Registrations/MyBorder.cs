using System.Reflection;
using SharpContainerProg.AAPublic;

namespace SharpRepoServiceProg.Registrations;

internal static class MyBorder
{
    private static string AssemblyName => Assembly
        .GetExecutingAssembly().FullName ?? string.Empty;
    
    public static IContainer4 MyContainer =
        ContainerService.MyContainer(
            AssemblyName);
    
    public static Registrations.Registration Registration = new Registrations.Registration();
    public static bool IsRegistered = Registration.Start(IsRegistered);
    public static IContainer4 OutContainer => Registration.OutContainer;
}
