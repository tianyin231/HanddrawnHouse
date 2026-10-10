"""导入与浏览器共用的室内方案；配色暂用 A，家具尺寸与设备选型未作施工确认。"""
import json
import subprocess
import bpy


def create_interior(root,level,collection,mesh_object,pbr,srgb):
    data=json.loads(subprocess.run(["node",str(root/"scripts/export-interior.mjs"),str(level)],
        check=True,capture_output=True,text=True,encoding="utf-8").stdout)
    col=collection("interior/design")
    def build(item,parent=None):
        if "positions" not in item:
            obj=bpy.data.objects.new(item["name"],None)
            col.objects.link(obj)
            finish(obj,item,parent)
            for child in item["children"]:build(child,obj)
            return obj
        opts=item["material"]
        material=pbr(f"interior/{level}/"+item["metadata"]["interior_material"],opts["color"],opts["roughness"],opts.get("metalness",0))
        bsdf=next(node for node in material.node_tree.nodes if node.type=="BSDF_PRINCIPLED")
        if "opacity" in opts:
            bsdf.inputs["Alpha"].default_value=opts["opacity"]
            material.diffuse_color=(*material.diffuse_color[:3],opts["opacity"])
            material.surface_render_method="DITHERED"
        if "emissive" in opts:
            color=opts["emissive"]
            bsdf.inputs["Emission Color"].default_value=tuple(srgb(int(color[i:i+2],16)/255) for i in (1,3,5))+(1,)
            bsdf.inputs["Emission Strength"].default_value=opts["emissiveIntensity"]
        material.use_backface_culling=opts.get("side",0)!=2
        points=item["positions"]
        vertices=[(points[i],-points[i+2],points[i+1]) for i in range(0,len(points),3)]
        faces=[(i,i+1,i+2) for i in range(0,len(vertices),3)]
        obj=mesh_object(item["name"],vertices,faces,col,material,recalculate=False)
        finish(obj,item,parent)
        normals=item["normals"]
        for polygon in obj.data.polygons:polygon.use_smooth=True
        obj.data.normals_split_custom_set_from_vertices([(normals[i],-normals[i+2],normals[i+1]) for i in range(0,len(normals),3)])
        return obj
    def finish(obj,item,parent):
        obj.parent=parent
        x,y,z=item["position"]
        obj.location=(x,-z,y)
        for key,value in item["metadata"].items():
            obj[key]=json.dumps(value,ensure_ascii=False) if isinstance(value,(dict,list)) else value
    return [build(item) for item in data]
