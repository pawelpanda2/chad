// using SharpContainerProg.Register;
// using Unity.Injection;
//
// namespace SharpContainerProg.AAPublic;
//
// public abstract class RegistrationBase
// {
//     public static IContainer3 Container3 = SetContainerStatic();
//     private bool registrationStarted;
//
//     private static IContainer3 SetContainerStatic()
//     {
//         if (Container3 != null)
//         {
//             return Container3;
//         }
//
//         return new Container3Unity();
//     }
//
//     private void SetContainer()
//     {
//         if (Container3 == null)
//         {
//             Container3 = new Container3Unity();
//         }
//     }
//
//     public RegistrationBase()
//     {
//         SetContainer();
//     }
//
//     public IContainer3 Start()
//     {
//         if (!registrationStarted)
//         {
//             registrationStarted = true;
//             Registrations();
//             registrationStarted = false;
//         }
//
//         return Container3;
//     }
//
//     public IContainer3 Start(ref bool isRegistered)
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
//         return Container3;
//     }
//
//     public abstract void Registrations();
//
//     public void RegisterByFunc<RegT>(Func<RegT> func, int type = 0)
//     {
//         var factory = new InjectionFactory(c =>
//         {
//             return func.Invoke();
//         });
//         if (type == 0)
//         {
//             OutContainer.RegisterSingleton<RegT>(factory);
//         }
//         if (type == 1)
//         {
//             OutContainer.RegisterType<RegT>(factory);
//         }
//     }
//
//     public void RegisterByFunc<RegT, ParT1>(
//         Func<ParT1, RegT> func, ParT1 t1)
//     {
//         OutContainer.RegisterSingleton<RegT>(new InjectionFactory(c =>
//         {
//             return func.Invoke(t1);
//         }));
//     }
//
//     public void RegisterByFunc<RegT, ParT1>(
//         Func<ParT1, RegT> rfunc,
//         Func<ParT1> arg1func)
//     {
//         OutContainer.RegisterSingleton<RegT>(new InjectionFactory(c =>
//         {
//             return rfunc.Invoke(arg1func.Invoke());
//         }));
//     }
//
//     public void RegisterByFunc<RegT, ParT1, ParT2>(
//         Func<ParT1, ParT2, RegT> rfunc,
//         ParT1 p1, ParT2 p2)
//     {
//         OutContainer.RegisterType<RegT>(new InjectionFactory(c =>
//         {
//             return rfunc.Invoke(p1, p2);
//         }));
//     }
// }