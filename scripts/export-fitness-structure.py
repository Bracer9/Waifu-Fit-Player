"""Local research conversion of the upstream nine-class LinkSeg checkpoint.

Uses the pinned dense ONNX port, with all learned parameters loaded strictly.
The mel frontend stays in JS; its fixed filterbank is checked against the
checkpoint. No DGL, torchaudio, API, user-map writes or global Python install.
"""
from pathlib import Path
import ast
import copy
import hashlib
import json
import sys
import types
import warnings

ROOT = Path(__file__).resolve().parent.parent
LAB = ROOT / 'artifacts/fitness-v4-2026-10-24'
sys.path.insert(0, str(LAB / 'pydeps'))
sys.path.insert(0, str(LAB / 'port'))
sys.path.insert(0, str(LAB / 'upstream/src'))
import numpy as np
import torch
from torch import nn

torch.set_num_threads(2)
warnings.filterwarnings('ignore', category=DeprecationWarning)
# Only torch modules are used. The original DGL graph classes are never
# instantiated; their dense equivalents come from the inspected port.
source = LAB / 'upstream/src/modules.py'
tree = ast.parse(source.read_text(encoding='utf-8'))
tree.body = [node for node in tree.body if not (
    isinstance(node, ast.Import) and any(n.name == 'dgl' for n in node.names))]
module = types.ModuleType('modules')
sys.modules['modules'] = module
exec(compile(tree, str(source), 'exec'), module.__dict__)
from dense_linkseg import DenseLinkSeg
# Expose the already-computed final embedding for within-song repetition study.
# This changes no computation or parameters of the original three outputs.
port_source = (LAB / 'port/onnx_linkseg.py').read_text(encoding='utf-8')
assert port_source.count('return bound_pred, class_pred, A_pred') == 1
port_module = types.ModuleType('onnx_linkseg_embeddings')
exec(compile(port_source.replace('return bound_pred, class_pred, A_pred',
    'return bound_pred, class_pred, A_pred, x_gnn_final'),
    str(LAB / 'port/onnx_linkseg.py'), 'exec'), port_module.__dict__)
LinkSegONNX = port_module.LinkSegONNX


class MelEncoder(nn.Module):
    """The upstream FrameEncoder after the fixed spectrogram frontend."""
    def __init__(self):
        super().__init__()
        self.frontend = module.ResFrontEnd(conv_ndim=32, nharmonics=1,
            nmels=64, output_size=32, dropout=.1)
        self.pos_embedding = nn.Parameter(torch.zeros(1, 16, 32))
        self.transformer = module.Transformer(32, 2, 8, 16, 32, .1)
        self.dropout = nn.Dropout(.1)
        self.mlp_head = nn.Linear(32, 32)

    def forward(self, mel):
        x = self.frontend(mel)
        x = self.dropout(x + self.pos_embedding[:, :x.size(1)])
        return self.mlp_head(self.transformer(x).mean(1))


checkpoint = LAB / 'upstream/data/model_9_classes.pt'
raw = torch.load(checkpoint, map_location='cpu', weights_only=True)
state = {k.removeprefix('network.'): v for k, v in raw.items()}
fixed = state.pop('encoder.spec.mel_scale.fb')
window = state.pop('encoder.spec.spectrogram.window')
fb = np.array(json.loads((ROOT / 'artifacts/fitness-retrain-2026-10-24/linkseg/src/mel-fb.json').read_text())['fb'], dtype=np.float32)
if fb.shape != tuple(fixed.shape):
    fb = fb.T
assert fb.shape == tuple(fixed.shape) and np.max(np.abs(fb-fixed.numpy())) < 1e-7, 'Mel filterbank differs'
assert torch.allclose(window, torch.hann_window(1024)), 'Spectrogram window differs'
dense = DenseLinkSeg(MelEncoder(), nb_section_labels=9).eval()
dense.load_state_dict(state, strict=True)
wrapped = LinkSegONNX(copy.deepcopy(dense)).eval()

torch.manual_seed(72)
checks = []
for count in [12, 31, 64]:
    mel = torch.randn(count, 1, 64, 64) * 12 - 35
    with torch.inference_mode():
        _, bound, labels, _ = dense(mel)
        wb, wl, _, embedding = wrapped(mel)
    error = max((bound-wb).abs().max().item(), (labels-wl).abs().max().item())
    assert error < 1e-4, f'Dense/wrapper mismatch {error}'
    checks.append({'frames': count, 'denseVsWrapperMaxError': error})
    if count == 31:
        mel.numpy().tofile(LAB / 'validation-mel.f32')
        wb.numpy().tofile(LAB / 'validation-bound.f32')
        wl.numpy().tofile(LAB / 'validation-label.f32')
        embedding.numpy().tofile(LAB / 'validation-embedding.f32')

target = LAB / 'linkseg_9c.onnx'
with torch.inference_mode():
    torch.onnx.export(wrapped, (mel,), str(target), dynamo=False,
        input_names=['mel'], output_names=['bound', 'label', 'apred', 'embedding'],
        dynamic_axes={'mel': {0:'N'},'bound':{0:'Nm1'},'label':{0:'N'},'apred':{0:'N',1:'N'},'embedding':{0:'N'}},
        opset_version=17, do_constant_folding=True)
import onnx
onnx.checker.check_model(onnx.load(target))
report = {'checkpointSha256':hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
    'modelSha256':hashlib.sha256(target.read_bytes()).hexdigest(),
    'bytes':target.stat().st_size, 'strictParameterLoad':True,
    'melFilterbankMatches':True, 'checks':checks,
    'labels':['silence','verse','chorus','intro','outro','inst','bridge','pre-chorus','post-chorus'],
    'torch':torch.__version__}
(LAB/'conversion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False),flush=True)
