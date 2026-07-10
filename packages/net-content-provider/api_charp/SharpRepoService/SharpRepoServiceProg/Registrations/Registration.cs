using SharpContainerProg.AAPublic;
using SharpRepoServiceProg.Duplications.Operations;
using SharpRepoServiceProg.Workers.APublic;
using SharpRepoServiceProg.Workers.CrudReads;
using SharpRepoServiceProg.Workers.CrudWrites;
using SharpRepoServiceProg.Workers.CrudWrites.WriteFolders;
using SharpRepoServiceProg.Workers.CrudWrites.WriteRefs;
using SharpRepoServiceProg.Workers.System;
using SharpRepoServiceProg.Workers.Validation;
using ItemWorker = SharpRepoServiceProg.Workers.APublic.ItemWorkers.ItemWorker;
using WriteTextWorker = SharpRepoServiceProg.Workers.CrudWrites.WriteTexts.WriteTextWorker;

namespace SharpRepoServiceProg.Registrations;

internal class Registration : RegistrationBase
{
    public override void Registrations()
    {
        RegisterBase();
        
        RegisterRead();

        RegisterValidation();

        RegisterWrite();

        MyBorder.MyContainer.RegisterByFunc(
            () => new ItemWorker());
        MyBorder.MyContainer.RegisterByFunc(
            () => new ManyItemsWorker());
    }

    private static void RegisterWrite()
    {
        MyBorder.MyContainer.RegisterByFunc(
            () => new WriteFolderWorker());
        
        MyBorder.MyContainer.RegisterByFunc(
            () => new WriteTextWorker());
        
        MyBorder.MyContainer.RegisterByFunc(
            () => new WriteRefWorker());
        
        MyBorder.MyContainer.RegisterByFunc(
            () => new WriteMultiWorker());
    }

    private static void RegisterRead()
    {
        MyBorder.MyContainer.RegisterByFunc(
            () => new ReadAddressWorker());
        
        // base; PathWorker
        // base; BodyWorker
        // base; ConfigWorker>();
        // base; SystemWorker>();
        // base; MemoryWorker>();
        // base; MigrationWorker>();
        // base; ReadManyWorker>();
        MyBorder.MyContainer.RegisterByFunc(
            () => new ReadFolderWorker());
        
        MyBorder.MyContainer.RegisterByFunc(
            () => new ReadTextWorker());
        
        MyBorder.MyContainer.RegisterByFunc(
            () => new ReadRefWorker());

        // ReadFolderWorker
        // ReadTextWorker
        // base
        MyBorder.MyContainer.RegisterByFunc(
            () => new ReadMultiWorker());
    }

    private static void RegisterValidation()
    {
        MyBorder.MyContainer.RegisterByFunc(
            () => new ValidationWorker());
    }

    private static void RegisterBase()
    {
        // nothing
        MyBorder.MyContainer.RegisterByFunc(
            () => new CustomOperationsService());
        
        // CustomOperationsService
        MyBorder.MyContainer.RegisterByFunc(
            () => new PathWorker());
        
        // PathWorker
        MyBorder.MyContainer.RegisterByFunc(
            () => new SystemWorker());
        
        MyBorder.MyContainer.RegisterByFunc(
            () => new ReadHelper());
        
        // PathWorker
        MyBorder.MyContainer.RegisterByFunc(
            () => new MemoryWorker());
        
        // BodyWorker
        MyBorder.MyContainer.RegisterByFunc(
            () => new BodyWorker());
        
        // CustomOperationsService
        // FileService
        // PathWorker
        // SystemWorker
        MyBorder.MyContainer.RegisterByFunc(
            () => new ConfigWorker());
        
        // CustomOperationsService
        // ConfigService
        // PathWorker
        MyBorder.MyContainer.RegisterByFunc(
            () => new MigrationWorker());
        
        // CustomOperationsService
        // FileService
        MyBorder.MyContainer.RegisterByFunc(
            () => new ReadManyWorker());
        
        MyBorder.MyContainer.RegisterByFunc(
            () => new GuidWorker());
    }
}
