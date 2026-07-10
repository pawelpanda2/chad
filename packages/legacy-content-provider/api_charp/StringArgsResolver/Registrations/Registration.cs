using SharpContainerProg.AAPublic;
using SharpRepoServiceProg.AAPublic;

namespace SharpApiArgsProg.Registrations;

internal class Registration : RegistrationBase
{
    public override void Registrations()
    {
        IRepoService repo = MyBorder.OutContainer.Resolve<IRepoService>();
        MyBorder.MyContainer.RegisterByFunc(
            () => repo);
        // RecreateInfoGroup recreateInfoGroup = new();
        // RegisterByFunc(() => recreateInfoGroup);
    }
}
