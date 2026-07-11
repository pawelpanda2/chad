using SharpContainerProg.AAPublic;

namespace SharpFileServiceTests.Registrations
{
    internal static class MyBorder
    {
        public static bool IsRegistered;
        public static Registration Registration = new Registration();
        public static IContainer Container => Registration.Start(ref IsRegistered);
    }
}
