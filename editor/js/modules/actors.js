var ActorsModule = {

	init: function()
	{
		LiteGUI.menubar.add("Node/Actor/Convert to Actor", this.convertNodeToActor.bind(this) );
		LiteGUI.menubar.add("Actions/Selection/Set as Bones", this.setAsBones.bind(this) );
	},

	convertNodeToActor: function()
	{
		var selected = SelectionModule.getSelectedNode();
		if(!selected)
			return;

		var children = selected.getDescendants();

		for(var i = 0; i < children.length; ++i)
		{
			var node = children[i];

			//has skinning?
			var skinDeformer = node.getComponent( LS.Components.SkinDeformer );
			if (skinDeformer)
			{
				var mesh = skinDeformer.getMesh();
				if(mesh)
				{
					//convert bones from absolute names to relative names
					var bones = mesh.bones;
					for(var j = 0; j < bones.length; ++j)
					{
						var bone = bones[j];
						var bone_name = bone[0];
						if(bone_name[0] == LS._uid_prefix) //is absolute
						{
							var bone_node = LS.GlobalScene.getNodeByUId( bone_name );
							bone[0] = bone_node.name;
						}
					}
				}

				//make bones relatives to parent
				skinDeformer.search_bones_in_parent = true;
				//skinDeformer.skeleton_root_node = selected.uid;
			}

			//has animation
			//Convert track names
			//TODO
		}

		console.log("Converted");
	},

	setAsBones: function()
	{
		var selection = SelectionModule.getSelectedNodes();
		for(var i = 0; i < selection.length; ++i)
		{
			var node = selection[i];
			node._is_bone = true;
		}
	}
}

CORE.registerModule( ActorsModule );