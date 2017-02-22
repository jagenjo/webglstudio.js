var UndoModule = {
	name: "Undo",
	max_history: 100,
	min_time_between_undos: 500,
	last_undo_time: 0, //to avoid doing too many undo steps simultaneously

	history: [],
	post_history: [],

	init: function()
	{
		var mainmenu = LiteGUI.menubar;

		mainmenu.add("Edit/Undo", { callback: function() { UndoModule.doUndo(); }});
		mainmenu.add("Edit/Redo", { callback: function() { UndoModule.doRedo(); }});
		mainmenu.add("Window/Undo history", { callback: function() { UndoModule.showUndoHistoryDialog(); }});

		LiteGUI.bind( this, "undo", function() {
			RenderModule.requestFrame();
		});
		LiteGUI.bind( this, "redo", function() {
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
			if(e.keyCode == 26 || (e.keyCode == 89 && (e.ctrlKey || e.metaKey)) || (e.charCode == 122 && e.altKey) ) //redo
			{
				UndoModule.doRedo();
				e.stopPropagation();
				e.preventDefault();
			}
		});

		LiteGUI.bind( CORE, "user_action", function(e){
			var action_info = e.detail;
			UndoModule.onUserAction(action_info[0],action_info[1],action_info[2]);
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
		this.post_history.length = 0;
		LiteGUI.trigger( this, "new_undo", o);
		if(!o.callback_undo)
			console.warn("Undo step without redo step",o);
		if(!o.callback_redo)
			console.warn("Undo step without redo step",o);
	},

	doUndo: function()
	{
		if(!this.history.length)
			return;

		var step = this.history.pop();
		if(step.callback_undo != null)
			step.callback_undo(step.data);
		this.post_history.push(step);
		LiteGUI.trigger( this, "undo", step);
		EditorModule.refreshAttributes();
		RenderModule.requestFrame();
	},

	doRedo: function()
	{
		if(!this.post_history.length)
			return;

		var step = this.post_history.pop();
		if(step.callback_redo)
			step.callback_redo(step.data);
		else
			console.warn( "UNDO step without REDO:", step.title );
		this.history.push(step);
		LiteGUI.trigger( this, "undo", step);
		EditorModule.refreshAttributes();
		RenderModule.requestFrame();
	},

	removeUndoSteps: function()
	{
		this.history.length = 0;
		this.post_history.length = 0;
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
		widgets.addButtons( null, ["Do UNDO","Do REDO"], function(v){ 
			if (v == "Do UNDO")
				UndoModule.doUndo();
			else
				UndoModule.doRedo();
		});

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

			for(var i = UndoModule.post_history.length - 1; i >= 0; --i)
			{
				var step = UndoModule.post_history[i];
				list.push( "<span style='opacity:0.5'>" + (step.title || "Step") + "</span>" );
			}

			list_widget.setValue( list );
			if(list.length)
				list_widget.selectIndex(  UndoModule.history.length - 1 );
		}
	},

	onUserAction: function( action, data, data2 )
	{
		switch( action )
		{
			case "scene_modified": this.saveSceneUndo(); break;
			case "node_created": this.saveNodeCreatedUndo( data ); break;
			case "node_deleted": this.saveNodeDeletedUndo( data ); break;
			case "node_changed": this.saveNodeChangeUndo( data ); break;
			case "node_renamed": this.saveNodeRenamedUndo( data, data2 ); break;
			case "node_transform": this.saveNodeTransformUndo( data ); break;
			case "nodes_transform": this.saveNodesTransformUndo( data ); break;
			case "node_parenting": this.saveNodeParentingUndo( data ); break;
			case "component_created": this.saveComponentCreatedUndo( data ); break;
			case "component_changed": this.saveComponentChangeUndo( data ); break;
			case "component_deleted": this.saveComponentDeletedUndo( data ); break;
			case "node_material_changed": this.saveNodeMaterialChangeUndo( data ); break;
			case "material_changed": this.saveMaterialChangeUndo( data ); break;
			default: 
				console.warn("Unknown undo action");
		}
	},

	saveSceneUndo: function()
	{
		this.addUndoStep({ 
			title: "Scene modified",
			data: { scene: JSON.stringify( LS.GlobalScene.serialize() ) } , //stringify to save some space
			callback_undo: function(d) {

				var selected_node = LS.GlobalScene.selected_node ? LS.GlobalScene.selected_node.uid : null;
				LS.GlobalScene.clear();
				d.new_scene = JSON.stringify( LS.GlobalScene.serialize() );
				LS.GlobalScene.configure( JSON.parse(d.scene) );
				SelectionModule.setSelection( LS.GlobalScene.getNode( selected_node ) );
			},
			callback_redo: function(d) {
				LS.GlobalScene.clear();
				LS.GlobalScene.configure( JSON.parse(d.new_scene) );
				SelectionModule.setSelection( LS.GlobalScene.getNode( selected_node ) );
			},
		});
	},

	saveNodeCreatedUndo: function( node )
	{
		if(!node || !node._parentNode)
			return;

		this.addUndoStep({ 
			title: "Node created: " + node.name,
			data: { node: node.uid, index: node._parentNode.childNodes.indexOf( node ) },
			callback_undo: function(d) {
				var node = LS.GlobalScene.getNode( d.node );
				if(!node || !node._parentNode)
					return;
				d.parent_uid = node._parentNode.uid;
				d.node_data = JSON.stringify( node.serialize() );
				node._parentNode.removeChild(node);
				SelectionModule.setSelection( node._parentNode );
			},
			callback_redo: function(d)
			{
				if( !d.node_data || !d.parent_uid )
					return;
				var parent_node = LS.GlobalScene.getNode( d.parent_uid );
				if(!parent_node)
					return;
				var new_node = new LS.SceneNode();
				new_node.configure( JSON.parse( d.node_data ) );
				parent_node.addChild( new_node, d.index );
				SelectionModule.setSelection( new_node );
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
			data: { node_uid: node.uid, node_data: JSON.stringify( node.serialize() ), parent_uid: parent.uid, index: parent.childNodes.indexOf( node ) },
			//restore
			callback_undo: function(d) {
				var parent_node = LS.GlobalScene.getNodeByUId( d.parent_uid );
				if(!parent_node)
					return;
				var new_node = new LS.SceneNode();
				new_node.configure( JSON.parse( d.node_data ) );
				parent_node.addChild( new_node, d.index );
				SelectionModule.setSelection( new_node );
			},

			//delete
			callback_redo: function(d)
			{
				var node = LS.GlobalScene.getNode( d.node_uid );
				if( !node || !node._parentNode )
					return;
				d.parent_uid = node._parentNode.uid;
				d.node_data = JSON.stringify( node.serialize() );
				d.index = node._parentNode.childNodes.indexOf( node );
				node._parentNode.removeChild(node);
				SelectionModule.setSelection( null );
			}
		});
	},

	saveNodeChangeUndo: function(node)
	{
		this.addUndoStep({ 
			title: "Node modified: " + node.name,
			data: { node_uid: node.uid, node_data: JSON.stringify( node.serialize() ) }, //stringify to save some space
			callback_undo: function(d) {
				var node = LS.GlobalScene.getNode( d.node_uid );
				if(!node)
					return;
				d.new_data = JSON.stringify( node.serialize() );
				node.configure( JSON.parse( d.node_data ) );
			},

			callback_redo: function(d) {
				var node = LS.GlobalScene.getNode( d.node_uid );
				if(!node)
					return;
				d.node_data = JSON.stringify( node.serialize() );
				node.configure( JSON.parse( d.new_data ) );
			}
		});
	},	

	saveNodeRenamedUndo: function(node, old_name)
	{
		this.addUndoStep({ 
			title: "Node renamed: " + node.name,
			data: { node: node.uid, new_name: node.name, old_name: old_name },
			callback_undo: function(d) {
				var node = LS.GlobalScene.getNode(d.node);
				if(!node)
					return;
				node.setName( d.old_name );
			},
			callback_redo: function(d) {
				var node = LS.GlobalScene.getNode(d.node);
				if(!node)
					return;
				node.setName( d.new_name );
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

		var node_ids = [];
		for(var i = 0; i < nodes.length; i++)
			node_ids.push( nodes[i]._uid );

		function inner_save_transforms()
		{
			var nodes_data = [];
			for(var i in nodes)
			{
				var node_uid = node_ids[i];
				var node = LS.GlobalScene.getNode( node_uid );
				if(!node || !node.transform)
					continue;
				nodes_data.push({ uid: node_uid, transform: node.transform.serialize() });
			}

			if(!nodes_data.length)
				return;
			return nodes_data;
		}

		var nodes_data = inner_save_transforms( nodes );

		this.addUndoStep({
			title: "Nodes transform",
			data: { nodes: nodes_data },
			callback_undo: function(d) {
				if(!d.nodes)
					return;

				d.new_data = inner_save_transforms( nodes );
				var moved_nodes = [];
				for(var i = 0; i < d.nodes.length; ++i)
				{
					var data = d.nodes[i];
					var node = LS.GlobalScene.getNode(data.uid);
					if(!node || !node.transform)
						continue;
					moved_nodes.push(node);
					node.transform.configure( data.transform );
				}
				SelectionModule.setMultipleSelection( moved_nodes );
			},
			callback_redo: function(d) {
				if(!d.new_data)
					return;
				var moved_nodes = [];
				for(var i = 0; i < d.new_data.length; ++i)
				{
					var data = d.new_data[i];
					var node = LS.GlobalScene.getNode(data.uid);
					if(!node || !node.transform)
						continue;
					moved_nodes.push(node);
					node.transform.configure( data.transform );
				}
				SelectionModule.setMultipleSelection( moved_nodes );
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
			callback_undo: function(d) {
				var scene = LS.GlobalScene;
				var old_parent = scene.getNode( d.old_parent );
				var node = scene.getNode( d.node );
				if(!node || !old_parent)
					return;
				d.new_parent = node._parentNode.uid;
				old_parent.addChild( node, null, true);
			},
			callback_redo: function(d) {
				var scene = LS.GlobalScene;
				var new_parent = scene.getNode( d.new_parent );
				var node = scene.getNode( d.node );
				if(!node || !new_parent)
					return;
				new_parent.addChild( node, null, true);
			}
		});
	},

	saveComponentCreatedUndo: function( component )
	{
		if(!component._root)
			return;

		this.addUndoStep({ 
			title: "Component created: " + LS.getObjectClassName(component),
			data: { node_uid: component._root.uid, component: component.uid }, //stringify to save some space
			callback_undo: function(d) {
				var node = LS.GlobalScene.getNode( d.node_uid );
				if(!node)
					return;
				var compo = node.getComponentByUId( d.component );
				if(!compo)
					return;
				d.compo_class = LS.getObjectClassName( compo );
				d.compo_data = JSON.stringify( compo.serialize() );
				d.index = node.getIndexOfComponent( component );
				node.removeComponent( compo );
				SelectionModule.setSelection( node );
			},
			callback_redo: function(d) {
				var node = LS.GlobalScene.getNode( d.node_uid );
				if(!node)
					return;
				var data = JSON.parse( d.compo_data );
				var class_object = LS.Components[ d.compo_class ];
				if(!class_object)
					return console.warn("Class not found for REDO", d.compo_class );
				var compo = new class_object( JSON.parse( d.compo_data ) );
				node.addComponent( compo, d.index );
				SelectionModule.setSelection( compo );
			}
		});
	},

	saveComponentChangeUndo: function( component, title )
	{
		if(!component._root)
			return;

		this.addUndoStep({ 
			title: (title || "Component modified") + ": " + LS.getObjectClassName(component),
			data: {  node_uid: component._root.uid, compo_uid: component.uid, compo_data: JSON.stringify( component.serialize() ) }, //stringify to save some space
			callback_undo: function(d) {
				var node = LS.GlobalScene.getNode(d.node_uid);
				if(!node)
					return;
				var compo = node.getComponentByUId( d.compo_uid );
				if(!compo)
					return;
				d.new_data = JSON.stringify( compo.serialize() );
				compo.configure( JSON.parse( d.compo_data ) );
				SelectionModule.setSelection( component );
			},
			callback_redo: function(d) {
				var node = LS.GlobalScene.getNode(d.node_uid);
				if(!node)
					return;
				var compo = node.getComponentByUId( d.compo_uid );
				if(!compo)
					return;
				compo.configure( JSON.parse( d.new_data ) );
				SelectionModule.setSelection( component );
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
			data: { node_uid: node._uid, compo_class: LS.getObjectClassName(component), index: node.getIndexOfComponent( component ), compo_data: JSON.stringify( component.serialize()) }, //stringify to save some space
			callback_undo: function(d) {
				var class_object = LS.Components[ d.compo_class ];
				if(!class_object)
					return console.warn("Class not found for UNDO", d.compo_class );
				var node = LS.GlobalScene.getNode( d.node_uid );
				if(!node)
					return;
				var compo = new class_object( JSON.parse( d.compo_data) );
				node.addComponent( compo, d.index );
				d.compo_uid = compo._uid;
				LEvent.trigger( node, "changed" );
				SelectionModule.setSelection( compo );
			},
			callback_redo: function(d) {
				var node = LS.GlobalScene.getNode( d.node_uid );
				if(!node)
					return;
				var compo = node.getComponentByUId( d.compo_uid );
				if(!compo)
					return;
				node.removeComponent( compo );
				LEvent.trigger( node, "changed" );
				SelectionModule.setSelection( node );
			}
		});
	},

	saveNodeMaterialChangeUndo: function( node )
	{
		this.addUndoStep({ 
			title: "Node Material changed: " + node.name,
			data: { node_uid: node.uid, material: node.material }, //stringify to save some space
			callback_undo: function(d) {
				var node = LS.GlobalScene.getNode( d.node_uid );
				if(!node)
					return;
				d.old_material = node.material;
				node.material = d.material;
			},
			callback_redo: function(d) {
				var node = LS.GlobalScene.getNode( d.node_uid );
				if(!node)
					return;
				node.material = d.old_material;
			}
		});
	},

	saveMaterialChangeUndo: function( material )
	{
		//TODO: use uid instead of instance of the material
		this.addUndoStep({ 
			title: "Material modified: " + LS.getObjectClassName(material),
			data: { material: material, mat_data: JSON.stringify( material.serialize() ) }, //stringify to save some space
			callback_undo: function(d) {
				d.new_mat_data = JSON.stringify( material.configure() );
				d.material.configure( JSON.parse(d.mat_data) );
			},
			callback_redo: function(d) {
				d.material.configure( JSON.parse(d.new_mat_data) );
			}
		});
	}
}

CORE.registerModule( UndoModule );