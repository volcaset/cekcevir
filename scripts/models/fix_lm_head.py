# Birleşik (merged) Marian decoder'ında bir dal, paylaşılan gömme matrisini
# 8-bit yerine 32-bit tutuyor (≈130 MB). Diğer dal gibi 8-bit sürümden
# DequantizeLinear ile üretilecek şekilde düzeltir; dosya ≈190 MB → ≈60 MB.
import sys, onnx
from onnx import helper

def fix(path):
    m = onnx.load(path)
    W = 'model.shared.weight_merged_0'
    changed = 0
    def walk(g):
        nonlocal changed
        for idx, n in enumerate(list(g.node)):
            if n.op_type == 'Transpose' and list(n.input) == [W]:
                out = n.output[0]
                n.input[0] = W + '_quantized'
                n.output[0] = out + '_quantized_fix'
                dq = helper.make_node('DequantizeLinear', [out + '_quantized_fix', W + '_scale', W + '_zero_point'], [out], name=out + '_DequantizeLinear_fix')
                pos = list(g.node).index(n)
                g.node.insert(pos + 1, dq)
                changed += 1
            for a in n.attribute:
                if a.g and a.g.node: walk(a.g)
    walk(m.graph)
    def used(g):
        for n in g.node:
            if W in n.input: return True
            for a in n.attribute:
                if a.g and a.g.node and used(a.g): return True
        return False
    if changed and not used(m.graph):
        keep = [i for i in m.graph.initializer if i.name != W]
        del m.graph.initializer[:]
        m.graph.initializer.extend(keep)
    onnx.checker.check_model(m)
    onnx.save(m, path)
    print(path, 'düzeltilen düğüm:', changed)

for p in sys.argv[1:]: fix(p)
