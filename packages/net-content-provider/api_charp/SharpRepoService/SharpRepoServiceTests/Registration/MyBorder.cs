using SharpContainerProg.AAPublic;

using System.Reflection;

namespace SharpRepoServiceTests.Registration;

internal static class MyBorder
{
    private static string AssemblyName => Assembly
        .GetExecutingAssembly().FullName ?? string.Empty;
    
    public static IContainer4 MyContainer =
        ContainerService.MyContainer(
            AssemblyName);
    
    public static Registration Registration = new Registration();
    public static bool IsRegistered = Registration.Start(IsRegistered);
    public static IContainer4 OutContainer => Registration.OutContainer;
}
