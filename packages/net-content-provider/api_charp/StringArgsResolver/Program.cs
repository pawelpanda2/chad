using SharpApiArgsProg.AAPublic;
using SharpApiArgsProg.Registrations;
using SharpRepoServiceProg.AAPublic;
using SharpRepoServiceProg.Workers.APublic.ItemWorkers;

// OUT MOCK REGISTRATION
new OutMockRegistration().Start(false);

// MODULE REGISTRATION
ModuleRegistrationBox.Registration = new Registration();
bool isReg = MyBorder.IsRegistered;

IStringArgsResolverService service = MyBorder.OutContainer
    .Resolve<IStringArgsResolverService>();

string serviceName = nameof(IRepoService);
string workerName = nameof(IItemWorker);
string methodName = nameof(IItemWorker.GetItem);
string param01 = "Notki";
string param02 = "";
string item = service.Invoke(
    [serviceName, workerName, methodName,
        param01, param02]);

Console.WriteLine(item);
