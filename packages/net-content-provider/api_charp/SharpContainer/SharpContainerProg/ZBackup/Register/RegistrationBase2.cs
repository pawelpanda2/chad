// using System.ComponentModel.Design;
// using Microsoft.Extensions.DependencyInjection;
// using SharpContainerProg.Register;
// using Unity.Injection;
//
// namespace SharpContainerProg.AAPublic;
//
// public abstract class RegistrationBase2
// {
//     public static IServiceCollection container = SetContainerStatic();
//     private bool registrationStarted;
//
//     private static IServiceCollection SetContainerStatic()
//     {
//         if (container != null)
//         {
//             return container;
//         }
//
//         return new ServiceCollection();
//     }
//
//     private void SetContainer()
//     {
//         if (container == null)
//         {
//             container = new ServiceCollection();
//         }
//     }
//
//     public RegistrationBase2()
//     {
//         SetContainer();
//     }
//
//     public IServiceCollection Start()
//     {
//         if (!registrationStarted)
//         {
//             registrationStarted = true;
//             Registrations();
//             registrationStarted = false;
//         }
//
//         return container;
//     }
//
//     public IServiceCollection Start(
//         ref bool isRegistered)
//     {
//         if (!registrationStarted
//             && !isRegistered)
//         {
//             registrationStarted = true;
//             Registrations();
//             isRegistered = true;
//             registrationStarted = false;
//         }
//
//         return container;
//     }
//
//     public abstract void Registrations();
//
//     public void RegisterByFunc<RegT>(
//         Func<RegT> func) where RegT : class
//     {
//         container.AddSingleton<RegT>(provider =>
//             func.Invoke());
//     }
//
//     public void RegisterByFunc<RegT, ParT1>(
//         Func<ParT1, RegT> func, ParT1 p1) where RegT : class
//     {
//         container.AddSingleton<RegT>(provider =>
//             func.Invoke(p1));
//     }
//
//     // public void RegisterByFunc<RegT, ParT1>(
//     //     Func<ParT1, RegT> rfunc,
//     //     Func<ParT1> arg1func)
//     // {
//     //     container.RegisterSingleton<RegT>(new InjectionFactory(c =>
//     //     {
//     //         return rfunc.Invoke(arg1func.Invoke());
//     //     }));
//     // }
//
//     public void RegisterByFunc<RegT, ParT1, ParT2>(
//         Func<ParT1, ParT2, RegT> func,
//         ParT1 p1, ParT2 p2) where RegT : class
//     {
//         container.AddSingleton<RegT>(provider =>
//             func.Invoke(p1, p2));
//     }
// }
