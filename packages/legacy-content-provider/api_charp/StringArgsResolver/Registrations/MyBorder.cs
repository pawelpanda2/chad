using System.Reflection;
using SharpContainerProg.AAPublic;

namespace SharpApiArgsProg.Registrations;

internal static class MyBorder
{
    // OUT-BORDER
    public static IContainer4 OutContainer => ModuleRegistrationBox.Registration
        .OutContainer;
    public static bool IsRegistered { get; } = ModuleRegistrationBox.Registration
        .Start(IsRegistered);
    
    // MY-BORDER
    public static IContainer4 MyContainer =>
        ContainerService.MyContainer(
            ModuleRegistrationBox.AssemblyName);
}

internal static class ModuleRegistrationBox
{
    // OUT-BORDER
    public static RegistrationBase Registration { get; set; }
    
    // MY-BORDER
    public static string AssemblyName = Assembly
        .GetExecutingAssembly().FullName ?? string.Empty;
}
