// using System.ComponentModel.Design;
// using SharpContainerProg.AAPublic;
// using System.Reflection;
// using Microsoft.Extensions.DependencyInjection;
// using Unity;
// using Unity.Injection;
//
// namespace SharpContainerProg.Register;
//
// internal class Container3Sc : IContainer3
// {
//     private IServiceCollection _containter = new ServiceCollection();
//     private static bool nLogLoaded = LoadNLogConfig();
//
//     private static bool LoadNLogConfig()
//     {
//         try
//         {
//             string assemblyFolder = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
//             NLog.LogManager.Configuration = new NLog.Config.XmlLoggingConfiguration(assemblyFolder + "\\NLog.config");
//             return true;
//         }
//         catch
//         {
//             return false;
//         }
//     }
//
//     public bool IsRegistered<T>()
//     {
//         bool isRegistered = _containter
//             .Any(service => service.ServiceType == typeof(T));
//         return isRegistered;
//     }
//
//     public T Resolve<T>()
//     {
//         var result = _containter.<T>();
//         return result;
//     }
//
//     public object Resolve(Type type)
//     {
//         var result = _containter.Resolve(type);
//         return result;
//     }
//
//     public void FillServiceCollection(
//         IServiceCollection serviceCollection)
//     {
//         foreach (IContainerRegistration? reg in _containter.Registrations)
//         {
//             serviceCollection.AddSingleton(
//                 reg.RegisteredType,
//                 reg.MappedToType);
//         }
//     }
//
//     public IContainer3 RegisterSingleton<T>(params object[] injectionMember)
//     {
//         var tmp = injectionMember.Select(x => (InjectionMember)x).ToArray();
//         var result = _containter.RegisterSingleton<T>(tmp);
//         return this;
//     }
//     
//     public IContainer3 RegisterSingleton<T>(
//         object service)
//     {
//         var type = typeof(T);
//         var typeTo = service.GetType();
//         IUnityContainer? result = _containter
//             .RegisterSingleton(type, typeTo);
//         return this;
//     }
//
//     public IContainer3 RegisterType<T>(params object[] injectionMember)
//     {
//         var tmp = injectionMember.Select(x => (InjectionMember)x).ToArray();
//         var result = _containter.RegisterType<T>(tmp);
//         return this;
//     }
// }
