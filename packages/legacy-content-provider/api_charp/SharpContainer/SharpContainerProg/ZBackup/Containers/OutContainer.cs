// using Microsoft.Extensions.DependencyInjection;
// using SharpContainerProg.Register;
//
// namespace SharpContainerProg.Containers;
//
// public class OutContainer : IContainer2
// {
//     private bool _isBuildDone;
//     public ServiceCollection serviceRegister { get; private set; }
//     public IServiceProvider serviceProvider { get; private set; }
//
//     public OutContainer()
//     {
//         serviceRegister = new ServiceCollection();
//     }
//
//     public void RegisterSingleton<RegT>(
//         RegT obj)
//             where RegT : class
//     {
//         serviceRegister.AddSingleton<RegT>(sp => 
//             obj);
//     }
//     
//     public void RegisterByFunc<T>(
//         Func<T> func)
//             where T : class
//     {
//         serviceRegister.AddTransient<T>(sp => 
//             func.Invoke());
//     }
//
//     public T Resolve<T>()
//     {
//         DoIfNotYetBuild();
//         object? service = serviceProvider.GetService(typeof(T));
//         return (T)service!;
//     }
//
//     public object? Resolve(Type type)
//     {
//         DoIfNotYetBuild();
//         object? service = serviceProvider.GetService(typeof(T));
//         return service;
//     }
//     
//     public bool IsServiceRegistered<T>()
//     {
//         bool isRegistered = serviceRegister
//             .Any(sd => sd.ServiceType == typeof(T));
//         return isRegistered;
//     }
//     
//     private void DoIfNotYetBuild()
//     {
//         if (_isBuildDone)
//         {
//             return;
//         }
//
//         serviceProvider = serviceRegister.BuildServiceProvider();
//     }
// }
