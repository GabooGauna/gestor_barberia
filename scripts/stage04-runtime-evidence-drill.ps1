#requires -Version 5.1
# Pure RAM fixtures use the EXACT validators executed by the runtime broker.
# Optional original manifest check reads metadata ONLY, never cipher/key/data.
param([switch] $VerifyOriginalManifestRejection)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Import-Definitions([string] $File,[string[]] $Names) {
    $tokens=$null; $errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $File),[ref]$tokens,[ref]$errors)
    if ($errors.Count) { throw 'Definition AST failed.' }
    foreach ($name in $Names) {
        $nodes=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$false))
        if ($nodes.Count -ne 1) { throw 'Definition missing.' }
        . ([scriptblock]::Create($nodes[0].Extent.Text))
        Set-Item -Path ('function:script:'+$name) -Value (Get-Item ('function:'+$name)).ScriptBlock
    }
}
Import-Definitions 'stage04-cutover-runtime.ps1' @('Get-EvidenceField','Assert-SupervisedManifestBinding','Assert-SupervisedRestoreBinding')
$run='11111111111111111111111111111111';$backup='22222222222222222222222222222222';$manifestHash='a'*64
$manifest=[pscustomobject]@{FormatVersion=1;SupervisionRunId=$run;BackupId=$backup;ProjectRef='ucmwykzrepmjucssjnum';ExportedSnapshot='00000003-00000042-1';DatabaseCipherSha256=('b'*64);RolesCipherSha256=('c'*64)}
$report=[pscustomobject]@{SupervisionRunId=$run;DrillId=$run;BackupId=$backup;ProjectRef='ucmwykzrepmjucssjnum';ExportedSnapshot=$manifest.ExportedSnapshot;
    ManifestSha256=$manifestHash;DatabaseCipherSha256=$manifest.DatabaseCipherSha256;RolesCipherSha256=$manifest.RolesCipherSha256;
    ContainerCleanupVerified=$true;CiphertextHashesVerified=$true;GcmAuthenticated=$true;PlainHashesVerified=$true;PgRestoreSingleTransactionExitZero=$true;DatabasePropertiesOwnerAclSettingsVerified=$true}
$script:checks=0
function Expect-Rejected([scriptblock] $Action) {
    $rejected=$false;try{& $Action}catch{$rejected=$true}
    if (-not $rejected) { throw 'Malformed evidence accepted.' };$script:checks++
}
function Clone($Value) { return ($Value | ConvertTo-Json -Depth 8 -Compress | ConvertFrom-Json) }
Assert-SupervisedManifestBinding $manifest $run $backup;$script:checks++
Assert-SupervisedRestoreBinding $report $manifest $manifestHash $run $backup;$script:checks++
foreach ($field in @('SupervisionRunId','BackupId','ProjectRef','ExportedSnapshot','DatabaseCipherSha256','RolesCipherSha256','FormatVersion')) {
    $bad=Clone $manifest
    $bad.$field='wrong'
    Expect-Rejected {Assert-SupervisedManifestBinding $bad $run $backup}
    $bad=Clone $manifest;$bad.PSObject.Properties.Remove($field)
    Expect-Rejected {Assert-SupervisedManifestBinding $bad $run $backup}
}
foreach ($field in @('SupervisionRunId','DrillId','BackupId','ProjectRef','ExportedSnapshot','ManifestSha256','DatabaseCipherSha256','RolesCipherSha256')) {
    $bad=Clone $report;$bad.$field='wrong'
    Expect-Rejected {Assert-SupervisedRestoreBinding $bad $manifest $manifestHash $run $backup}
}
foreach ($field in @('ContainerCleanupVerified','CiphertextHashesVerified','GcmAuthenticated','PlainHashesVerified','PgRestoreSingleTransactionExitZero','DatabasePropertiesOwnerAclSettingsVerified')) {
    foreach ($value in @($false,'false','true',1,@($true))) {
        $bad=Clone $report;$bad.$field=$value
        Expect-Rejected {Assert-SupervisedRestoreBinding $bad $manifest $manifestHash $run $backup}
    }
    $bad=Clone $report;$bad.PSObject.Properties.Remove($field)
    Expect-Rejected {Assert-SupervisedRestoreBinding $bad $manifest $manifestHash $run $backup}
}
Expect-Rejected {Assert-SupervisedRestoreBinding $true $manifest $manifestHash $run $backup}
Expect-Rejected {Assert-SupervisedManifestBinding $true $run $backup}
$originalRejected=$false
if ($VerifyOriginalManifestRejection) {
    Import-Definitions 'stage04-store-db-credential.ps1' @('Assert-NoReparsePath','Assert-PrivateAcl')
    $path=Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) 'GestorBarberia\backups\stage04-ab70bce0fa53469f8f8659c4564970ba\manifest.json'
    Assert-NoReparsePath $path
    Assert-PrivateAcl -LiteralPath $path -OwnerSid ([Security.Principal.WindowsIdentity]::GetCurrent().User)
    if ((Get-Item -LiteralPath $path).Length -gt 65536) { throw 'Manifest metadata oversized.' }
    $original=[IO.File]::ReadAllText($path) | ConvertFrom-Json
    if ($null -ne $original.PSObject.Properties['SupervisionRunId']) { throw 'Expected original preparatory manifest changed.' }
    Expect-Rejected {Assert-SupervisedManifestBinding $original $run 'ab70bce0fa53469f8f8659c4564970ba'}
    $originalRejected=$true
}
[pscustomobject]@{case='runtime_evidence_same_validators';checks=$script:checks;passed=$true;originalManifestWithoutRunIdRejected=$originalRejected;
    originalManifestModified=$false;cipherOrKeyRead=$false;newCapture=$false;restoreExecuted=$false;remoteOperations=$false} | ConvertTo-Json -Compress
