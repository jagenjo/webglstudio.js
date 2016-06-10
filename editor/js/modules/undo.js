var UndoModule = {
	name: "Undo",
	max_history: 100,
	min_time_between_undos: 500,
	last_undo_time: 0, //to avoid doing too many undo steps simultaneously

	history: [],

	init: function()
	{
		var mainmenu = LiteGUI.menubar;

		mainmenu.add("Edit/Undo", { callback: function() { UndoModule.doUndo(); }});
		mainmenu.add("Window/Undo history", { callback: function() { UndoModule.showUndoHistoryDialog(); }});

		LiteGUI.bind( this, "undo", function() {
			RenderModule.requestFrame();
		});

		//grab some keys
		document.addEventListener("keydown",function(e){
			if(e.target.nodeName.toLowerCase() == "input" || e.target.nodeName.toLowerCase() == "textarea")
				return;
			if(e.keyCode == 26 || (e.keyCode == 90 && (e.ctrlKey || e.metaKey)) || (e.charCode == 122 && e.ctrlKey) ) //undo
			{
				UndoModule.doUndo();
				e.stopPropagation();
				e.preventDefault();
			}
		});
	},

	onShowSettingsPanel: function(name,widgets)
	{
		if(name != "editor")
			return;

		widgets.addTitle( "Undo" );
		widgets.addNumber( "History steps", UndoModule.max_history, { step: 1, min: 0, max: 500, callback: function(v){ UndoModule.max_history = v; }});
	},

	addUndoStep: function(o)
	{
		var now =  new Date().getTime();
		if( (now - this.last_undo_time) < this.min_time_between_undos) 
			return;
		this.history.push(o);
		this.last_undo_time = now;
		if(this.history.length > this.max_history)
			this.history.shift();
		LiteGUI.trigger( this, "new_undo", o);
	},

	doUndo: function()
	{
		if(!this.history.length) return;

		var step = this.history.pop();
		if(step.callback != null)
			step.callback(step.data);

		LiteGUI.trigger( this, "undo", step);
	},

	removeUndoSteps: function()
	{
		this.history = [];
		LiteGUI.trigger( this, "clear_undo" );
	},

	showUndoHistoryDialog: function()
	{
		var that = this;
		var dialog = new LiteGUI.Dialog("undo-history",{ title:"Undo history", width: 300, height: 500, draggable: true, closable: true });

		//events
		LiteGUI.bind( this, "new_undo", inner_update );
		LiteGUI.bind( this, "undo", inner_update );
		dialog.on_close = function(){
			LiteGUI.unbind( UndoModule, "new_undo", inner_update );
			LiteGUI.unbind( UndoModule, "undo", inner_update );
		}

		var widgets = new LiteGUI.Inspector();

		var list_widget = widgets.addList( null, [], { height: 400 } );
		widgets.addButton( null, "Step backwards", function(){ UndoModule.doUndo(); });

		dialog.add( widgets );
		dialog.adjustSize();
		dialog.show();

		inner_update();

		function inner_update()
		{
			var list = [];
			for(var i = 0; i < UndoModule.history.length; ++i)
			{
				var step = UndoModule.history[i];
				list.push( step.title || "Step" );
			}
			list_widget.setValue( list );
			if(list.length)
				list_widget.selectIndex( list.length - 1 );
		}
	},

	saveSceneUndo: function()
	{
		this.addUndoStep({ 
			title: "Scene modified",
			data: JSON.stringify( LS.GlobalScene.serialize() ), //stringify to save some space
			callback: function(d) {
				var selected_node = LS.GlobalScene.selected_node ? LS.GlobalScene.selected_node.uid : null;
				LS.GlobalScene.clear();
				LS.GlobalScene.configure( JSON.parse(d) );
				SelectionModule.setSelection( LS.GlobalScene.getNode( selected_node ) );
				RenderModule.requestFrame();
			}
		});
	},

	saveNodeCreatedUndo: function( node )
	{
		this.addUndoStep({ 
			title: "Node created: " + node.name,
			data: { node: node.uid },
			callback: function(d) {
				var node = LS.GlobalScene.getNode(d.node);
				if(!node)
					return;
				if(node && node._parentNode)
					node._parentNode.removeChild(node);
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},

	saveNodeDeletedUndo: function( node )
	{
		if(!node)
			return;

		var parent = node.parentNode;
		if(!parent)
			return;

		UndoModule.addUndoStep({ 
			title: "Node deleted: " + node.name,
			data: { node_data: JSON.stringify( node.serialize() ), parent_uid: parent.uid, index: parent.childNodes.indexOf( node ) },
			callback: function(d) {
				var parent_node = LS.GlobalScene.getNodeByUId( d.parent_uid );
				if(!parent_node)
					return;
				var new_node = new LS.SceneNode();
				new_node.configure( JSON.parse( d.node_data ) );
				parent_node.addChild( new_node, d.index );
				SelectionModule.setSelection( new_node );
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},

	saveNodeChangeUndo: function(node)
	{
		this.addUndoStep({ 
			title: "Node modified: " + node.name,
			data: { node: node.uid, info: JSON.stringify( node.serialize() ) }, //stringify to save some space
			callback: function(d) {
				var node = LS.GlobalScene.getNode(d.node);
				if(!node)
					return;
				node.configure( JSON.parse( d.info ) );
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},	

	saveNodeRenamedUndo: function(node, old_name)
	{
		this.addUndoStep({ 
			title: "Node renamed: " + node.name,
			data: { node: node.uid, old_name: old_name }, //stringify to save some space
			callback: function(d) {
				var node = LS.GlobalScene.getNode(d.node);
				if(!node)
					return;
				node.setName( d.old_name );
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},	

	saveNodeTransformUndo: function( node )
	{
		this.saveNodesTransformUndo([node]);
	},

	//for several nodes
	saveNodesTransformUndo: function( nodes )
	{
		if(!nodes || !nodes.length)
			return;

		var nodes_data = [];
		for(var i in nodes)
		{
			var node = nodes[i];
			if(!node.transform)
				continue;
			nodes_data.push({ uid: nodes[i].uid, transform: node.transform.serialize() });
		}

		if(!nodes_data.length)
			return;

		this.addUndoStep({
			title: "Nodes transform",
			data: { nodes: nodes_data },
			callback: function(d) {
				for(var i = 0; i < d.nodes.length; ++i)
				{
					var data = d.nodes[i];
					var node = LS.GlobalScene.getNode(data.uid);
					if(!node || !node.transform)
						continue;
					node.transform.configure( data.transform );
				}
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},

	saveNodeParentingUndo: function( node )
	{
		if(!node || !node.parentNode)
			return;

		this.addUndoStep({ 
			title: "Node parenting: " + node.name,
			data: { node: node.uid, old_parent: node.parentNode.uid },
			callback: function(d) {
				var scene = LS.GlobalScene;
				var old_parent = scene.getNode( d.old_parent );
				var node = scene.getNode( d.node );
				if(!node || !old_parent)
					return;
				old_parent.addChild( node, null, true);
				RenderModule.requestFrame();
			}
		});
	},

	saveComponentCreatedUndo: function( component )
	{
		if(!component._root)
			return;

		this.addUndoStep({ 
			title: "Component created: " + LS.getObjectClassName(component),
			data: { node: component._root.uid, component: component.uid }, //stringify to save some space
			callback: function(d) {
				var node = LS.GlobalScene.getNode(d.node);
				if(!node)
					return;
				var compo = node.getComponentByUId( d.component );
				if(!compo)
					return;
				node.removeComponent(compo);				
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},

	saveComponentChangeUndo: function( component )
	{
		if(!component._root)
			return;

		this.addUndoStep({ 
			title: "Component modified: " + LS.getObjectClassName(component),
			data: {  node: component._root.uid, component: component.uid, info: JSON.stringify( component.serialize() ) }, //stringify to save some space
			callback: function(d) {
				var node = LS.GlobalScene.getNode(d.node);
				if(!node)
					return;
				var compo = node.getComponentByUId( d.component );
				if(!compo)
					return;
				compo.configure( JSON.parse( d.info ) );
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},

	saveComponentDeletedUndo: function( component )
	{
		if(!component._root)
			return;

		var node = component._root;

		this.addUndoStep({ 
			title: "Component Deleted: " + LS.getObjectClassName(component),
			data: { node: node, component: LS.getObjectClassName(component), index: node.getIndexOfComponent( component ), info: JSON.stringify( component.serialize()) }, //stringify to save some space
			callback: function(d) {
				var class_object = LS.Components[d.component];
				if(!class_object)
					return console.warn("Class not found for UNDO",d.component);
				d.node.addComponent( new class_object( JSON.parse(d.info) ), d.index );
				LEvent.trigger(d.node, "changed");
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},

	saveNodeMaterialChangeUndo: function( node )
	{
		this.addUndoStep({ 
			title: "Node Material changed: " + node.name,
			data: { node: node.uid, material: node.material }, //stringify to save some space
			callback: function(d) {
				var node = LS.GlobalScene.getNode(d.node);
				if(!node)
					return;
				node.material = d.material;
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},

	saveMaterialChangeUndo: function( material )
	{
		this.addUndoStep({ 
			title: "Material modified: " + LS.getObjectClassName(material),
			data: { material: material, info: JSON.stringify( material.serialize() ) }, //stringify to save some space
			callback: function(d) {
				d.material.configure( JSON.parse(d.info) );
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},
}

CORE.registerModule( UndoModule );