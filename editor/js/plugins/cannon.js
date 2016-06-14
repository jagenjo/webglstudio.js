
(function(){

//Cannon.js physics in LiteScene
LS.Network.requestScript("http://schteppe.github.io/cannon.js/build/cannon.js", function(){
	fixCANNON(); //could be useful to change things in cannon
});

//used to rotate planes because in cannon they are vertical
var rotQuat = quat.create();
quat.setAxisAngle(rotQuat,[1,0,0],-Math.PI/2);


function PhysicsEngine(o)
{
	this.enabled = true;

	this._is_running = false;

	this.time_factor = 1;
	this.iterations = 7;
	this.tolerance = 0.1;
	this.gravity = vec3.fromValues(0,-10,0);

	if(o)
		this.configure(o);
}

PhysicsEngine["@gravity"] = { type: "vec3" };

PhysicsEngine.prototype.onAddedToScene = function(scene)
{
	LEvent.bind( scene, "start", this.onStart, this );
	LEvent.bind( scene, "update", this.onUpdate, this );
}

PhysicsEngine.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbindAll( scene, this );
}

PhysicsEngine.prototype.onStart = function()
{
	if( typeof(CANNON) == "undefined" )
	{
		console.error("CANNON.js not included in the project, cannot use physics");
		return;
	}

	//world
	var world = this._world = new CANNON.World();
	PhysicsEngine._world = world;
	world.quatNormalizeSkip = 0;
	world.quatNormalizeFast = false;
	world.defaultContactMaterial.contactEquationStiffness = 1e9;
	world.defaultContactMaterial.contactEquationRelaxation = 4;
	world.gravity.set( this.gravity[0], this.gravity[1], this.gravity[2] );
	world.broadphase = new CANNON.NaiveBroadphase();

	//solver
	var solver = this._solver = new CANNON.GSSolver();
	solver.iterations = this.iterations;
	solver.tolerance = this.tolerance;
	var split = true;
	if(split)
		world.solver = new CANNON.SplitSolver(solver);
	else
		world.solver = solver;

	this._is_running = true;

	//materials
	var physicsMaterial = new CANNON.Material("baseMaterial");
	var physicsContactMaterial = new CANNON.ContactMaterial(physicsMaterial,
															physicsMaterial,
															{
																friction: 0.5,
																restitution: 0.3
															});
    world.addContactMaterial( physicsContactMaterial );

	LEvent.trigger( this._root.scene, "physics_ready", this._world );
}

PhysicsEngine.prototype.onUpdate = function(e,dt)
{
	if(!this._world || !this.enabled)
		return;

	this._world.step( dt * this.time_factor );
	LEvent.trigger( this._root.scene, "physics_updated", this._world );
	this._root.scene.refresh();
}

LS.registerComponent( PhysicsEngine );


function PhysicsRigidBody(o)
{
	this.enabled = true;

	this.mass = 5;
	this.size = 1.3;
	this.linear_damping = 0.9;
	this.shape = "sphere";
	this.mesh = null;

	if(o)
		this.configure(o);
}

PhysicsRigidBody["@shape"] = { widget: "combo", values: ["sphere","box","mesh"] };
PhysicsRigidBody["@mesh"] = { type: LS.TYPES.MESH };

PhysicsRigidBody.prototype.onAddedToScene = function(scene)
{
	LEvent.bind( scene, "physics_ready", this.onPhysicsReady, this );
	LEvent.bind( scene, "physics_updated", this.onPhysicsUpdate, this );
}

PhysicsRigidBody.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbindAll( scene, this );
}

PhysicsRigidBody.prototype.getWorld = function()
{
	var compo = LS.GlobalScene.root.getComponent( LS.Components.PhysicsEngine );
	if(!compo || !compo._world || !compo._is_running)
		return null;
	return compo._world;
}

PhysicsRigidBody.prototype.onPhysicsReady = function( e, world )
{
	if(!this.enabled)
		return;

	var node = this._root;
	if(!node.transform)
		return;

	//shape
	var shape = null;
	switch(this.shape)
	{
		case "box": shape = new CANNON.Box(new CANNON.Vec3(this.size*0.5,this.size*0.5,this.size*0.5)); break;
		default:
		case "sphere": shape = new CANNON.Sphere(this.size); break;
	}
	this._shape = shape;

	//body
	var body = this._body = new CANNON.Body({ mass: this.mass });
	body.addShape( this._shape );

	//transform
	var pos = node.transform.getGlobalPosition();
	var rotation = node.transform.getGlobalRotation();
	body.position.set( pos[0], pos[1], pos[2] );
	body.quaternion.set( rotation[0], rotation[1], rotation[2], rotation[3] );
	//cannon doesnt support scale...

	//physic properties
	body.linearDamping = this.linear_damping;

	//attach
	world.add( body );
	this._attached = true;
}

PhysicsRigidBody.prototype.onPhysicsUpdate = function(e, world)
{
	var transform = this._root.transform;
	if(!transform)
		return;

	if( !this.enabled )
	{
		if(this._attached)
		{
			world.removeBody( this._body );
			this._attached = false;
		}
		return;
	}

	if(!this._body)
	{
		this.onPhysicsReady( e, world );
		return;
	}

	if(!this._attached)
	{
		world.add( this._body );
		this._attached = true;
		return;
	}

	//set state
	this._body.linearDamping = this.linear_damping;

	//extract transform
	transform._position.set([ this._body.position.x, this._body.position.y, this._body.position.z ]);
	transform._rotation.set([ this._body.quaternion.x, this._body.quaternion.y, this._body.quaternion.z, this._body.quaternion.w ]);
	transform._must_update_matrix  = true;
}

LS.registerComponent( PhysicsRigidBody );

// Collider ***************************************

function PhysicsCollider( o )
{
	this.enabled = true;

	this.size = 10;
	this.shape = "plane"; //infinite plane

	if(o)
		this.configure(o);

	//check to attach
	var world = this.getWorld();
	if(!world)
		return;
	this.onPhysicsReady(null,world);
}

PhysicsCollider["@shape"] = { widget: "combo", values: ["plane","sphere","box"] };

PhysicsCollider.prototype.getWorld = PhysicsRigidBody.prototype.getWorld;

PhysicsCollider.prototype.onAddedToScene = function(scene)
{
	LEvent.bind( scene, "physics_ready", this.onPhysicsReady, this );
	LEvent.bind( scene, "physics_updated", this.onPhysicsUpdate, this );
}

PhysicsCollider.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbindAll( scene, this );
}

PhysicsCollider.prototype.onPhysicsReady = function( e, world )
{
	if(!this.enabled)
		return;

	var node = this._root;
	if(!node.transform)
		return;

	//shape
	var shape = null;
	switch(this.shape)
	{
		case "plane": shape = new CANNON.Plane(); this._rotate90 = true; break;
		case "box": shape = new CANNON.Box(new CANNON.Vec3(this.size*0.5,this.size*0.5,this.size*0.5)); break;
		default:
		case "sphere": shape = new CANNON.Sphere(this.size); break;
	}
	this._shape = shape;

	//body
	var body = this._body = new CANNON.Body({ mass: 0 });
	body.addShape( this._shape );

	//transform
	var pos = node.transform.getGlobalPosition();
	var rotation = node.transform.getGlobalRotation();
	if(this._rotate90)
		quat.multiply(rotation,rotation,rotQuat);
	body.position.set( pos[0],pos[1],pos[2] );
	body.quaternion.set( rotation[0], rotation[1], rotation[2], rotation[3] );

	//attach
	world.add( body );
	this._attached = true;
}

PhysicsCollider.prototype.onPhysicsUpdate = function(e,world)
{
	//enabled false
	if(!this.enabled)
	{
		if(this._attached)
		{
			world.removeBody( this._body );
			this._attached = false;
		}
		return;
	}

	//enabled 

	if(!this._body)
	{
		this.onPhysicsReady( null, world );
		return;
	}

	if(this._attached)
	{
		var node = this._root;
		var body = this._body;
		var pos = node.transform.getGlobalPosition();
		var rotation = node.transform.getGlobalRotation();
		body.position.set( pos[0],pos[1],pos[2] );
		if(this._rotate90)
			quat.multiply(rotation,rotation,rotQuat);
		body.quaternion.set( rotation[0], rotation[1], rotation[2], rotation[3] );
		return;
	}
}

LS.registerComponent( PhysicsCollider );



fixCANNON();

//CANNON changes
function fixCANNON()
{
	//...
}

})();