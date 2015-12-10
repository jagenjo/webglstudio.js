/* Actions system
Actions are commands that you could perform in nodes or components, like copy,paste, clone, delete, get info, etc
They could be performed using the right mouse button or the quickbar
To retrieve the actions the system calls getEditorActions in the instance, this should return an object containing action name and info about the action.

When performing an action the system calls doEditorAction in the instance, passing the name.
*/

/* Scene Node Actions *********************************************/
LS.SceneNode.actions = {};

LS.SceneNode.prototype.getActions = function( actions )
{
	actions = actions || {};
	for(var i in LS.SceneNode.actions)
		actions[i] = LS.SceneNode.actions[i];
	return actions;
}

LS.SceneNode.prototype.doAction = function( name_action )
{
	if(!name_action)
		return;

	var action = null;
	if(name_action.constructor === String)
	{
		var actions = this.getActions();
		if(!actions || !actions[name_action])
			return false;
		action = actions[name_action];
	}
	else
		action = name_action;

	if(action.callback)
		return action.callback.call(this);

	return false;
}

LS.SceneNode.actions["select"] = { 
	title:"Select",
	callback: function(){
		SelectionModule.setSelection( this );
	}
};

LS.SceneNode.actions["select_children"] = { 
	title:"Select Children",
	callback: function(){
		var children = this.getDescendants();
		children.push( this );
		SelectionModule.setMultipleSelection( children );
	}
};

LS.SceneNode.actions["create_prefab"] = { 
	title:"Create Prefab",
	callback: function(){
		PrefabMaker.showCreatePrefabDialog( this );
	}
};

LS.SceneNode.actions["inspect_in_dialog"] = { 
	title:"Inspect in dialog",
	callback: function(){
		EditorModule.inspectInDialog(this);
	}
};

LS.SceneNode.actions["info"] = { 
	title:"Show Information",
	callback: function(){
		EditorModule.showNodeInfo(this);
	}
};

LS.SceneNode.actions["addcomponent"] = { 
	title:"Add Component",
	callback: function(){
		EditorModule.showAddComponentToNode( this, function(){ EditorModule.refreshAttributes(); } );
	}
};

LS.SceneNode.actions["layers"] = { 
	title:"Show Layers",
	callback: function(){
		var node = this;
		EditorModule.showLayersEditor( node.layers, function(v){
			node.layers = v;
			RenderModule.requestFrame();
		});
	}
};

LS.SceneNode.actions["delete"] = { 
	title:"Delete",
	callback: function(){
		EditorModule.deleteNode( this );
	}
};

/* Components *************************/
LS.Component.actions = {};

LS.Component.getActions = function( component )
{
	var actions = {};

	//global component actions (like copy, paste, delete)
	for(var i in LS.Component.actions)
		actions[i] = LS.Component.actions[i];

	//specific actions of a component
	if( component.constructor.actions )
		for(var i in component.constructor.actions)
			actions[i] = component.constructor.actions[i];

	//actions specific of this component
	if( component.getActions )
		actions = component.getActions( actions );

	return actions;
}

LS.Component.doAction = function( component, name_action )
{
	if(!name_action)
		return;

	var action = null;
	if(name_action.constructor === String)
	{
		var actions = this.getActions( component );
		if(!actions || !actions[name_action])
			return false;
		action = actions[name_action];
	}
	else
		action = name_action;
	if(action.callback)
		return action.callback.call(component);
	return false;
}



LS.Component.actions["info"] = { 
	title:"Show Information",
	callback: function(){
		EditorModule.showComponentInfo(this);
	}
};

LS.Component.actions["copy"] = { 
	title:"Copy",
	callback: function(){
		EditorModule.copyComponentToClipboard(this);
	}
};

LS.Component.actions["paste"] = { 
	title:"Paste",
	callback: function(){
		EditorModule.pasteComponentFromClipboard(this);
	}
};

LS.Component.actions["paste"] = { 
	title:"Paste",
	callback: function(){
		EditorModule.pasteComponentFromClipboard(this);
	}
};

LS.Component.actions["delete"] = { 
	title:"Delete",
	callback: function(){
		EditorModule.deleteNodeComponent(this);
	}
};

LS.Component.actions["reset"] = { 
	title:"Reset",
	callback: function(){
		EditorModule.resetNodeComponent(this);
	}
};

LS.Component.actions["select"] = { 
	title:"Select",
	callback: function(){
		SelectionModule.setSelection(this);
	}
};



/*
LS.Components.Transform.prototype.getEditorActions = function( actions )
{
	delete actions["delete"];
	return actions;
}
*/

LS.Components.Light.actions["select_target"] = { title: "Select Target", callback: function() { SelectionModule.setSelection({ instance: this, info: "target" }); }};

LS.Components.Camera.actions["select_center"] = { title: "Select Center", callback: function() { SelectionModule.setSelection({ instance: this, info: "center"}); }};
LS.Components.Camera.actions["preview"] = { title: "Preview", callback: function() { 
		if(RenderModule.preview_camera != this)
			RenderModule.preview_camera = this;
		else
			RenderModule.preview_camera = null;
		LS.GlobalScene.refresh();
	}
};

LS.Components.Camera.actions["edit_layers"] = { title: "Edit Layers", callback: function() { 
		var camera = this;
		EditorModule.showLayersEditor( this.layers, function(v){
			camera.layers = v;
			RenderModule.requestFrame();
		});	
	}
};


LS.Components.SkinDeformer.actions["convert_bones"] = { title: "Convert Bones to Relative", callback: function() { this.convertBonesToRelative(); }};



//*********** Material Actions *************************************
/*
LS.Material.actions = {};

LS.Material.actions["copy"] = { title: "Copy", callback: function() { 
};

"Copy","Paste","Delete","Share","Instance"
*/