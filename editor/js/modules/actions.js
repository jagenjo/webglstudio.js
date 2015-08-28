/* Actions system
Actions are commands that you could perform in nodes or components, like copy,paste, clone, delete, get info, etc
They could be performed using the right mouse button or the quickbar
To retrieve the actions the system calls getEditorActions in the instance, this should return an object containing action name and info about the action.

When performing an action the system calls doEditorAction in the instance, passing the name.
*/

/* Scene Node Actions *********************************************/
LS.SceneNode.editor_actions = {};

LS.SceneNode.prototype.getEditorActions = function()
{
	return LS.SceneNode.editor_actions;
}

LS.SceneNode.prototype.doEditorAction = function( name )
{
	var actions = this.getEditorActions();
	if(!actions[name])
		return false;
	var action = actions[name];
	if(action.callback)
		return action.callback(this);
	return false;
}

LS.SceneNode.editor_actions["select"] = { 
	title:"Select",
	callback: function( node ){
		SelectionModule.setSelection( node );
	}
};

LS.SceneNode.editor_actions["select_children"] = { 
	title:"Select Children",
	callback: function( node ){
		var children = node.getDescendants();
		children.push( node );
		SelectionModule.setMultipleSelection( children );
	}
};

LS.SceneNode.editor_actions["inspect_in_dialog"] = { 
	title:"Inspect in dialog",
	callback: function( node ){
		EditorModule.inspectInDialog(node);
	}
};

LS.SceneNode.editor_actions["info"] = { 
	title:"Show Information",
	callback: function( node ){
		EditorModule.showNodeInfo(node);
	}
};

LS.SceneNode.editor_actions["addcomponent"] = { 
	title:"Add Component",
	callback: function( node ){
		EditorModule.showAddComponentToNode( node );
	}
};

LS.SceneNode.editor_actions["layers"] = { 
	title:"Show Layers",
	callback: function( node ){
		EditorModule.showLayersEditor( node );
	}
};

/* Components *************************/

LS.Transform.prototype.getEditorActions = function( actions )
{
	//transform cannot be deleted
	var pos = actions.indexOf("Delete");
	if(pos != -1)
		actions.splice(pos,1);
	actions.push("Center in Mesh");
	return actions;
}

LS.Transform.prototype.doEditorAction = function( name )
{
	if (name == "Center in Mesh")
		this.centerInMesh();
	else
		return false;
	return true;
}


LS.Light.prototype.getEditorActions = function( actions )
{
	actions.push("Select Target");
	return actions;
}

LS.Light.prototype.doEditorAction = function( name )
{
	if (name == "Select Target")
		SelectionModule.setSelection({ instance: this, info: "target" });
	else
		return false;
	return true;
}

LS.Camera.prototype.getEditorActions = function( actions )
{
	actions.push("Select Center","Preview");
	actions.push("Edit Layers");
	return actions;
}

LS.Camera.prototype.doEditorAction = function( name )
{
	if (name == "Select Center")
	{
		SelectionModule.setSelection({ instance: this, info: "center"});
	}
	else if (name == "Preview")
	{
		if(RenderModule.preview_camera != this)
			RenderModule.preview_camera = this;
		else
			RenderModule.preview_camera = null;
		LS.GlobalScene.refresh();
	}
	else if (name == "Edit Layers")
		EditorModule.showLayersEditor( this );
	else
		return false;
	return true;
}

